/// <reference path="../userspace/index.d.ts" />

/**
 * Delete recursively files and directories passed as parameter
 * @usage <path1> <path2> ... <pathN>
 */

if (typeof webcontainer !== 'function')
  throw new Error('Missing webcontainer runtime');

webcontainer(async process => {
  const encoder = new TextEncoder();
  const printErr = (line: string) => process.write(2, encoder.encode(line + '\n'));
  let paths = process.argv;
  if (paths.length === 1)
    paths.push(process.cwd);
  for (let i = 1; i < paths.length; i++) {
    let path = paths[i]!;
    try {
      await process.unlink(path, true);
    } catch (err) {
      await printErr(`${process.argv[0]}: ${path}: ${((err instanceof Error && err.message) || err)}`);
    }
  }
});
