// @ts-check

/**
 * The POSIX `rm` command
 * @param {import('../../src/process_worker').ProcessController} process
 */
export default async function cat(process) {
  for (const path of process.argv.slice(1))
    try {
      await process.delete(path);
    } catch (err) {
      await process.printErr(`rm: ${path}: ${err?.message ?? err}`);
    }
}
