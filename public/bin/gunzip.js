// @ts-check

/**
 * The POSIX `gunzip` command
 * @param {import('../../src/process_worker').ProcessController} process
 */
export default async function gzip(process) {
  /** @type {WritableStream<Uint8Array>} */
  let output;
  if (process.argv.length === 1)
    output = process.stdout;
  else
    output = await process.createWriteStream(process.argv[1]);
  await process.stdin
    // @ts-ignore
    .pipeThrough(new DecompressionStream('gzip'))
    .pipeTo(output);
}
