/// <reference path="../userspace/index.d.ts" />

/**
 * Redirects stdin to stdout and to all files passed as parameters
 * @usage <file1> <file2> ... <fileN>
 */

if (typeof webcontainer !== 'function')
  throw new Error('Missing webcontainer runtime');

webcontainer(async process => {
  const encoder = new TextEncoder();
  let rids = new Set((await Promise.all([...new Set(process.argv.slice(1))].map(path =>
    process
      .openWrite(path, 'override', true)
      .catch(err =>
        process.write(
          2,
          encoder.encode(`${process.argv[0]}: ${path}: ${((err instanceof Error && err.message) || err)}\n`)
        ).then(() => null)
      )
  ))).filter((rid: number | null): rid is number => rid !== null));
  rids.add(1);
  let buffer: Uint8Array | null;
  while ((buffer = await process.read(0)) !== null)
    await Promise.all(
      [...rids].map(r =>
        process.write(r, buffer!)
          .catch(err => {
            rids.delete(r);
            process.write(
              2,
              encoder.encode(`${process.argv[0]}: ${process.getResourceURI(r)!}: ${((err instanceof Error && err.message) || err)}\n`)
            )
          })
      )
    );
});
