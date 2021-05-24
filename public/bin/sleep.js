// @ts-check

/**
 * The POSIX `sleep` command
 * @param {import('../../src/process_worker').ProcessController} process
 */
export default async function sleep(process) {
  let timeout = +process.argv[1];
  if (isNaN(timeout))
    return 1;
  await new Promise(res => setTimeout(res, timeout * 1000));
}
