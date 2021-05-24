// @ts-check

/**
 * This command is executed when the terminal loads.
 * @param {import('../../src/process_worker').ProcessController} process
 */
export default async function webrc(process) {
  const motd = '/etc/motd';
  await process.print('A naive proof-of-concept of a WebContainer API (https://github.com/stackblitz/webcontainer-core).');
  await process.print('');
  await process.print(
    'Every command you type here runs own or more process in their own dedicated worker. ' +
    'Every process has an entrypoint (a JavaScript module to start the process) and POSIX-like attributes ' +
    '(pid, working directory, environment variables, uid/gid, arguments and stdin/stdout/std for the moment).'
  );
  await process.print('You can see them starting and stopping in the Dev Tools of your browser.');
  await process.print('');
  await process.print("Type 'help' to get started.");
  try {
    const stream = await process.createReadStream(motd);
    await process.print('');
    await stream.pipeTo(process.stdout, {
      preventAbort: true,
      preventCancel: true,
      preventClose: true
    });
  } catch (err) {
    if (!/not (?:be )?found/.test(String(err?.message)))
      await process.printErr(`${motd}: ${err?.message || err}`);
  }
  const webrc = '/.webrc.js';
  if (process.argv[0] !== webrc)
    try {
      try {
        await (await process.createReadStream(webrc)).cancel();
      } catch (err) {
        const input = await process.createReadStream(process.argv[0]);
        const output = await process.createWriteStream(webrc);
        await input.pipeTo(output);
      }
    } catch (err) {
    }
}
