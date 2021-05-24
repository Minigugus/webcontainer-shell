// @ts-check

/**
 * The POSIX `echo` command
 * @param {import('../../src/process_worker').ProcessController} process
 */
export default async function echo(process) {
  await process.print(process.argv.slice(1).join(' '));
}
