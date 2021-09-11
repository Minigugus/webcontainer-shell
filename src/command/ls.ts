/// <reference path="../userspace/index.d.ts" />

if (typeof webcontainer !== 'function')
  throw new Error('Missing webcontainer runtime');

webcontainer(async process => {
  const encoder = new TextEncoder();
  const print = (line: string) => process.write(1, encoder.encode(line + '\n'));
  const printErr = (line: string) => process.write(2, encoder.encode(line + '\n'));
  const noColor = !!process.getenv('NOCOLOR');
  let paths = process.argv;
  if (paths.length === 1)
    paths.push(process.cwd);
  for (let i = 1; i < paths.length; i++) {
    let path = paths[i]!;
    if (paths.length !== 2)
      await print(`${i - 1 ? '\n' : ''}${path}:`);
    try {
      for await (let entry of await process.readDir(path))
        switch (entry.type) {
          case 'directory':
            await print(`drwxrwxrwx 1 nobody nobody 0 1970/01/01 00:00 ${noColor
              ? entry.name
              : `\x1B[1;34m${entry.name}\x1B[0m`}`);
            break;
          case 'file':
            if (entry.name.endsWith('.js'))
              await print(`-rwxrwxrwx 1 nobody nobody 0 1970/01/01 00:00 ${noColor
                ? entry.name
                : `\x1B[1;32m${entry.name}\x1B[0m`}`);
            else
              await print(`-rw-rw-rw- 1 nobody nobody 0 1970/01/01 00:00 ${entry.name}`);
        }
    } catch (err) {
      await printErr(`${process.argv[0]}: ${path}: ${((err instanceof Error && err.message) || err)}`);
    }
  }
});
