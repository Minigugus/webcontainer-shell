// @ts-check

/**
 * The POSIX `pwd` command
 * @param {import('../../src/process_worker').ProcessController} process
 */
export default async function pwd(process) {
  await process.print(process.cwd);
}
