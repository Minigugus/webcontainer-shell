/// <reference path="../userspace/index.d.ts" />

/**
 * Spawn 2^N processes - WARNING! There is no limit over how many processes are spawn (can crash your browser!)
 * @usage [N]
 */

if (typeof webcontainer !== 'function')
  throw new Error('Missing webcontainer runtime');

webcontainer(async process => {
  const left = Number(process.argv[1]);
  if (!isFinite(left))
    return process.write(1, new TextEncoder().encode('Expected a positive number as argument, received ' + process.argv[1] + '\n'));
  if (left <= 0)
    return process.write(1, new TextEncoder().encode('  '.repeat(left) + left + '\n'));
  const entrypoint = !process.entrypoint.startsWith('blob:')
    ? URL.createObjectURL(await new Response(await process.createReadStream(process.entrypoint)).blob())
    : process.entrypoint
  try {
    const [p1, p2] = await Promise.all([
      process.spawn(entrypoint, {
        args: [String(left - 1)],
        arg0: process.argv[0] + ' L',
      }),
      process.spawn(entrypoint, {
        args: [String(left - 1)],
        arg0: process.argv[0] + ' R',
      })
    ]);
    {
      const reader = p1.stdout.getReader();
      let read;
      while (!(read = await reader.read()).done)
        await process.write(1, read.value);
    }
    await process.write(1, new TextEncoder().encode('  '.repeat(left) + left + '\n'));
    {
      const reader = p2.stdout.getReader();
      let read;
      while (!(read = await reader.read()).done)
        await process.write(1, read.value);
    }
  } finally {
    if (entrypoint !== process.entrypoint)
      URL.revokeObjectURL(entrypoint);
  }
});
