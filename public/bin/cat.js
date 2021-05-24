// @ts-check

/**
 * The POSIX `cat` command
 * @param {import('../../src/process_worker').ProcessController} process
 */
export default async function cat(process) {
  if (process.argv.length === 1)
    await process.stdin.pipeTo(process.stdout);
  else {
    for (const path of process.argv.slice(1)) {
      try {
        await (await process.createReadStream(path)).pipeTo(process.stdout, {
          preventAbort: true,
          preventCancel: true,
          preventClose: true
        });
      } catch (err) {
        await process.printErr(`cat: ${path}: ${err?.message ?? err}`);
      }
    }
  }
}
