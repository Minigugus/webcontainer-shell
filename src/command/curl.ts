/// <reference path="../userspace/index.d.ts" />

/**
 * Download a file while printing its content to stdout
 * @usage (-u) [url]
 */

if (typeof webcontainer !== 'function')
  throw new Error('Missing webcontainer runtime');

webcontainer(async function curl(process) {
  debugger;
  const args = process.argv.slice(1);
  let upload = args.findIndex(x => x === '-u');
  if (args.length < (~upload ? 2 : 1))
    return 1;
  const options: RequestInit = {};
  if (upload !== -1) {
    options.method = 'POST';
    options.body = process.stdin();
    args.splice(upload, 1);
  }
  try {
    const response = await fetch(args[0]!, options);
    await response.body?.pipeTo(process.stdout());
  } catch (err) {
    await process.write(2, new TextEncoder().encode(`curl: cannot fetch: ${(err instanceof Error && err.message) || err}\n`));
  }
});
