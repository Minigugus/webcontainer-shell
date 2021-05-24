// @ts-check

/**
 * The POSIX `ls` command
 * @param {import('../../src/process_worker').ProcessController} process
 */
export default async function ls(process) {
  let paths = process.argv.slice(1);
  if (paths.length === 0)
    paths.push(process.cwd);
  for (let i = 0; i < paths.length; i++){
    let path = paths[i];
    if (paths.length !== 1)
      await process.print(`${i ? '\n' : ''}${path}:`);
    try {
      for await (let entry of process.readdir(path))
        switch (entry.kind) {
          case 'directory':
            await process.print(`drwxrwxrwx 1 nobody nobody 0 1970/01/01 00:00 \x1B[1;34m${entry.name}\x1B[0m`);
            break;
          case 'file':
            if (entry.name.endsWith('.js'))
              await process.print(`-rwxrwxrwx 1 nobody nobody 0 1970/01/01 00:00 \x1B[1;32m${entry.name}\x1B[0m`);
            else
              await process.print(`-rw-rw-rw- 1 nobody nobody 0 1970/01/01 00:00 ${entry.name}`);
        }
    } catch (err) {
      await process.printErr(`ls: ${path}: ${err?.message ?? err}`);
    }
  }
}
