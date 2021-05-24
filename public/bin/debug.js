// @ts-check

/**
 * WebContainer process for debug purpose only
 * @param {import('../../src/process_worker').ProcessController} process
 */
export default async function debug(process) {
  console.info(process);
  await new Promise(() => null /* Won't stop until killed */);
}
