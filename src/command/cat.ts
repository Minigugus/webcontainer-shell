/// <reference path="../userspace/index.d.ts" />

if (typeof webcontainer !== 'function')
  throw new Error('Missing webcontainer runtime');

webcontainer(async process => {
  let pendingWrite = Promise.resolve();
  const encoder = new TextEncoder();
  const paths = process.argv.slice(1);
  if (paths.length === 0)
    paths.push('-');
  for (const path of paths) {
    let rid = null;
    try {
      rid = path === '-' ? 0 : await process.openRead(path);
      let buffer;
      while ((buffer = await process.read(rid)) !== null) {
        await pendingWrite;
        pendingWrite = process.write(1, buffer);
      }
      await pendingWrite;
    } catch (err) {
      await pendingWrite.catch(() => null);
      await process.write(2, encoder.encode(`${path}: ${((err instanceof Error && err.message) || err)}\n`));
    } finally {
      pendingWrite = Promise.resolve();
      if (rid !== null)
        await process.close(rid);
    }
  }
});
