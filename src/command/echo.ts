/// <reference path="../userspace/index.d.ts" />

/**
 * Prints command line arguments concatenated with spaces to stdout
 * @usage <arg1> <arg2> ... <argN>
 */

if (typeof webcontainer !== 'function')
  throw new Error('Missing webcontainer runtime');

webcontainer(async process => {
  await process.write(1, new TextEncoder().encode(process.argv.slice(1).join(' ') + '\n'));
});
