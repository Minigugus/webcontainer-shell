/// <reference path="../userspace/index.d.ts" />

if (typeof webcontainer !== 'function')
  throw new Error('Missing webcontainer runtime');

webcontainer(async process => {
  await process.write(1, new TextEncoder().encode(process.argv.slice(1).join(' ') + '\n'));
});
