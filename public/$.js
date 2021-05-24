import {kernel} from "../dist/index.mjs";

export * from "../dist/index.mjs";

/**
 *
 * @param {TemplateStringsArray} xs
 * @param {any[]} args
 */
export async function $(xs, ...args) {
  let prev;
  const pipes = [];
  const commandline = xs[0] + args.map((a, i) => `"${a.replace(/["\\]/, m => '\\' + m)}"` + xs[i + 1]);
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
    for (const cmd of cmds) {
      const c = await kernel.exec({cmd: cmd[0], args: cmd.slice(1)});
      if (prev)
        pipes.push(prev.stdout.pipeTo(c.stdin));
      prev = c;
    }
    const [status, stdout] = await Promise.all([
      prev.status,
      new Response(prev.stdout).text(),
      new Response(prev.stderr).text()
    ]);
    console.log(stdout);
    return status;
  } finally {
    await Promise.all(pipes);
  }
}
