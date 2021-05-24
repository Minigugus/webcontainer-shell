import {kernel} from "../dist/index.mjs";

/**
 *
 * @param {WritableStreamDefaultWriter<string>} output
 * @return {WritableStream<Uint8Array>}
 */
function writable(output) {
  const decoder = new TextDecoder();
  return new WritableStream({
    async start() {
      await output.ready;
    },
    async write(chunk, controller) {
      await output.ready;
      await output.write(decoder.decode(chunk, {stream: true}));
    },
    async close() {
      const chunk = decoder.decode(undefined, {stream: false});
      if (chunk)
        await output.write(chunk);
    }
  });
}

/**
 *
 * @param {string} commandline
 * @param {string} cwd
 * @param {ReadableStream<string>} input
 * @param {WritableStreamDefaultWriter<string>} output
 * @returns {Promise<void>}
 */
export async function run(commandline, cwd, input, output) {
  let prev;
  const pipes = [];
  try {
    let escaped = false;
    const cmds = [...commandline].reduce((acc, c) => {
      if (c === '"')
        escaped = !escaped;
      else if (escaped)
        acc[0][0] += c;
      else if (c === ' ')
        acc[0][0] && acc[0].unshift('');
      else if (c === '|') {
        if (!acc[0][0])
          acc[0].shift();
        acc.unshift(['']);
      } else
        acc[0][0] += c;
      return acc;
    }, [['']]).map(x => x.reverse()).reverse();
    console.debug(cmds);
    let processes = [];
    for (const cmd of cmds) {
      let entrypoint = cmd[0];
      if (!entrypoint.includes('/'))
        entrypoint = `/bin/${entrypoint}.js`;
      else
        entrypoint = new URL(entrypoint, new URL(cwd + '/', 'file:///')).pathname;
      try {
        const c = await kernel.exec({
          cmd: entrypoint,
          args: cmd.slice(1),
          cwd,
          env: { // TODO Real environment variables management
            'PATH': '/bin',
            'USER': 'nobody'
          }
        });
        processes.push(c);
        if (prev)
          pipes.push(prev.stdout.pipeTo(c.stdin).catch(err => console.debug(err)));
        else
          pipes.push(input.pipeThrough(new TextEncoderStream()).pipeTo(c.stdin).catch(err => console.debug(err)));
        pipes.push(c.stderr.pipeTo(writable(output)).catch(err => console.debug(err)));
        prev = c;
      } catch (err) {
        await output.write(`${cmd[0]}: ${err?.message ?? err}\n`);
        processes.forEach(p => p.kill());
        return;
      }
    }
    pipes.push(prev.stdout.pipeTo(writable(output)).catch(err => console.debug(err)));
    return await prev.status;
  } finally {
    await Promise.all(pipes);
    await output.close().catch(err => console.debug(err));
  }
}