/// <reference path="../userspace/index.d.ts" />

if (typeof webcontainer !== 'function')
  throw new Error('Missing webcontainer runtime');

webcontainer(async process => {
  const duration = Number(process.argv[1]);
  if (isFinite(duration) && duration > 0)
    await new Promise(res => setTimeout(res, duration));
});
