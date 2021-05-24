// @ts-check

/**
 * The POSIX `env` command
 * @param {import('../../src/process_worker').ProcessController} process
 */
export default async function env(process) {
  const result = Object
    .entries(process.env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  if (result)
    await process.print(result);
}
