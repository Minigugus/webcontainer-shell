/// <reference path="../userspace/index.d.ts" />

/**
 * Prints environment variables passed to this process
 */

if (typeof webcontainer !== 'function')
  throw new Error('Missing webcontainer runtime');

webcontainer(async process => {
  await process.write(1, new TextEncoder().encode(
    Object.entries(process.env)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n')
  );
});
