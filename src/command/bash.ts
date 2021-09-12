/// <reference path="../userspace/index.d.ts" />

/**
 * The shell that powers this terminal
 */

if (typeof webcontainer !== 'function')
  throw new Error('Missing webcontainer runtime');

const ENCODER = new TextEncoder();

const BUILTIN: Record<string, (process: LocalProcess, argv: [string, ...string[]]) => Promise<void>> =
  Object.assign(Object.create(null), {
    'cd': async (process: LocalProcess, argv: [string, ...string[]]) => {
      switch (argv.length) {
        case 1:
          argv[1] = '/';
        case 2:
          process.cwd = argv[1]!;
          break;
        default:
          await process.write(2, ENCODER.encode(`bash: ${argv[0]}: too many arguments\r\n`));
      }
    },
    'pwd': async (process: LocalProcess) => {
      await process.write(1, ENCODER.encode(process.cwd + '\r\n'));
    },
    'exit': async (process: LocalProcess, argv: [string, ...string[]]) => {
      process.exit(Number(argv[1]!));
    },
    'user': async (process: LocalProcess, argv: [string, ...string[]]) => {
      if (argv.length > 1)
        process.setenv('USER', argv[1] || 'nobody');
      else
        await process.write(1, ENCODER.encode(process.getenv('USER') + '\r\n'));
    },
    'hostname': async (process: LocalProcess, argv: [string, ...string[]]) => {
      if (argv.length > 1)
        process.setenv('HOST', argv[1] || new URL(location.origin).host);
      else
        await process.write(1, ENCODER.encode(process.getenv('HOST') + '\r\n'));
    },
    'unset': async (process: LocalProcess, argv: [string, ...string[]]) => {
      argv.slice(1).forEach(n => process.setenv(n, null));
    },
  });

function mapError(err: Error) {
  switch (err.message) {
    case 'ENOTFOUND':
      return 'not found';
  }
  return err.message;
}

webcontainer(async process => {
  const prompt = () => ENCODER.encode(
    `\x1B[1;32m${process.getenv('USER') || 'nobody'
    }@${process.getenv('HOST') || new URL(location.origin).host
    }\x1B[0m:\x1B[1;34m${process.cwd
    }\x1B[0m$ `
  );
  const pump = async (input: ReadableStream<Uint8Array>, rid: number) => {
    const decoder = new TextDecoder();
    const reader = input.getReader();
    let read;
    while (!(read = await reader.read()).done) {
      const decoded = decoder.decode(read.value, { stream: true });
      await process.write(rid, ENCODER.encode(decoded.replace(/\r?\n/, '\r\n')));
    }
  }
  const rid = 0;
  try {
    try {
      const rid = await process.openRead('/etc/motd');
      let buffer;
      while ((buffer = await process.read(rid, )) !== null)
        await process.write(1, buffer);
      await process.close(rid);
    } catch (err) {
      const msg = (err instanceof Error && err.message) || String(err);
      if (msg !== 'ENOTFOUND')
      await process.write(2, ENCODER.encode(`/etc/motd: ${msg}`));
    }
    await process.write(2, new Uint8Array(prompt()));
    let line: number[] = [];
    let running: Promise<any> | null = null;
    let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    let buffer;
    while ((buffer = await process.read(rid)) !== null) {
      // console.debug('', buffer, line);
      let output: number[] = [];
      for (let i = 0; i < buffer.byteLength; i++) {
        const c = buffer[i]!;
        switch (c) {
          case 4: // ^D
            if (!line.length)
              if (writer)
                await writer.close();
              else {
                await process.write(2, new Uint8Array([101, 120, 105, 116, 13, 10]));
                return 0;
              }
            break;
          case 12: // ^L
            if (!running) {
              output.push(27, 99); // '\ec'
              output = output.concat([...prompt(), ...line]);
            } else {
              output.push(94, 76); // '^L'
            }
            break;
          case 10: // \r
            break;
          case 13: // \n
            output.push(13, 10);
            if (writer) {
              line.push(10);
              await writer.ready;
              await writer.write(new Uint8Array(line));
              line = []
              break;
            }
            // const argv = new TextDecoder()
            //   .decode(new Uint8Array(line))
            //   .split(' ')
            //   .filter(a => a);
            let cmd: Cmd | null = null;
            try {
              cmd = parseCmd(new TextDecoder().decode(new Uint8Array(line)));
              console.debug('cmd', cmd);
              line = [];
              if (!cmd.arg0) {
                Object.entries(cmd.env)
                  .forEach(([k, v]) => process.setenv(k, v))
                output = output.concat([...prompt(), ...line]);
                break;
              }
              const env = Object.assign(process.env, cmd.env);
              if (cmd.arg0 in BUILTIN) {
                const c = cmd;
                running = Promise.resolve()
                  .then(() => BUILTIN[c.arg0!]!(process, [c.arg0!, ...c.args]));
              } else {
                let c: Cmd | null = cmd, child, promises: Promise<any>[] = [];
                do {
                  let prev = child;
                  child = await process.spawn(c.arg0!, {
                    args: c.args,
                    env
                  });
                  promises.push(pump(child.stderr, 2).catch(() => null));
                  if (writer === null) {
                    writer = child.stdin.getWriter();
                    writer.closed.then(() => (writer = null));
                  } else if (prev) {
                    promises.push(prev.stdout.pipeTo(child.stdin));
                  }
                } while ((c = c.pipeTo) !== null);
                // const child = await process.spawn(cmd.arg0, {
                //   args: cmd.args,
                //   env
                // });
                // writer = child.stdin.getWriter();
                // writer.closed.then(() => (writer = null));
                promises.push(pump(child.stdout, 1).catch(() => null));
                running = Promise.all(promises);
              }
              running.finally(async () => {
                await writer?.close().catch(() => null);
                writer = null;
                await process.write(2, new Uint8Array([...prompt(), ...line]));
                running = null;
              });
            } catch (err) {
              output = output.concat([
                ...ENCODER.encode(`bash: ${cmd ? `${cmd.arg0}: ` : ''}${((err instanceof Error && mapError(err)) || err)}\r\n`),
                ...prompt(),
                ...line
              ]);
            }
            break;
          case 3: // ^C
            if (!running) {
              line = [];
              output.push(13, 10);
              output = output.concat([...prompt(), ...line]);
            } else {
              output.push(94, 67); // '^C'
            }
            break;
          case 0x1b: // \e
            let d;
            while ((d = buffer[++i]) && (d < 97 || d > 122));
            break;
          case 127: // (backspace)
            if (line.length) {
              const [removed = 0] = line.splice(line.length - 1, 1);
              if (String.fromCharCode(removed).length)
                output.push(8, 32, 8); // '\b \b'
            }
            break;
          default:
            if (c >= 32) {
              line.push(c);
              if (String.fromCharCode(c).length)
                output.push(c);
            }
            break;
        }
      }
      await process.write(2, new Uint8Array(output));
    }
    await writer?.close().catch(() => null);
    await running;
  } catch (err) {
    await process.write(2, ENCODER.encode(`${process.argv[0]}: ${((err instanceof Error && err.message) || err)}\n`));
  }
  await process.write(2, new Uint8Array([101, 120, 105, 116, 13, 10]));
});

interface Cmd {
  env: Record<string, string>;
  arg0: string | null;
  args: string[];
  pipeTo: Cmd | null; //number | string | 
}

function parseCmd(input: string): Cmd {
  const cmd = {
    env: Object.create(null),
    arg0: null as string | null,
    args: [] as string[],
    pipeTo: null as Cmd | null,
  };
  let match;
  while ((input = input.trim()).length > 0) {
    if ((match = /^[^\s\|\>\<]+/.exec(input)) !== null) {
      const arg = match[0]!;
      input = input.slice(arg.length);
      let index;
      if (cmd.arg0 === null && (index = arg.indexOf('=')) !== -1) {
        const key = arg.slice(0, index);
        const value = arg.slice(index + 1);
        cmd.env[key] = value;
      } else if (cmd.arg0 === null) {
        cmd.arg0 = arg;
      } else {
        cmd.args.push(arg);
      }
    } else {
      if (cmd.arg0)
        if (input[0] === '|') {
          cmd.pipeTo = parseCmd(input.slice(1));
          input = '';
          if (cmd.pipeTo.arg0)
            continue;
        }
      throw new Error('malformed command line');
    }
  }
  return cmd;
}
