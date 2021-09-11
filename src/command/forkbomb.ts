/// <reference path="../userspace/index.d.ts" />

if (typeof webcontainer !== 'function')
  throw new Error('Missing webcontainer runtime');

webcontainer(async process => {
  const left = Number(process.argv[1]);
  if (isFinite(left) || left <= 0)
    return process.write(1, new TextEncoder().encode('  '.repeat(left) + left + '\n'));
  const entrypoint = !process.entrypoint.startsWith('blob:')
    ? URL.createObjectURL(await (await fetch(process.entrypoint)).blob())
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
