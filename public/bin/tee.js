// @ts-check

/**
 * The POSIX `tee` command
 * @param {import('../../src/process_worker').ProcessController} process
 */
export default async function tee(process) {
  let input = process.stdin;
  const pipes = [];
  for (const path of process.argv.slice(1)) {
    let tee;
    [tee, input] = input.tee();
    pipes.push(
      tee
        .pipeTo(await process.createWriteStream(path))
        .catch(err => process.printErr(`tee: ${path}: ${err?.message ?? err}`))
    );
  }
  pipes.push(input.pipeTo(process.stdout).catch(err => process.printErr(`tee: (stdout): ${err?.message ?? err}`)));
  await Promise.all(pipes);
}
