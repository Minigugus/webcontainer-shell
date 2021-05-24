// @ts-check

/**
 * The POSIX `curl` command
 * @param {import('../../src/process_worker').ProcessController} process
 */
export default async function curl(process) {
  const args = process.argv.slice(1);
  if (args.length < 1)
    return 1;
  let upload = args.findIndex(x => x === '-u');
  const options = {};
  if (upload !== -1) {
    options.method = 'POST';
    options.body = process.stdin;
    args.splice(upload, 1);
  }
  const response = await fetch(args[0], options);
  await response.body.pipeTo(process.stdout);
}
