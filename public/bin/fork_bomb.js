// @ts-check

/**
 * WebContainer process for debug purpose only
 * @param {import('../../src/process_worker').ProcessController} process
 */
export default async function fork_bomb(process) {
  const depth = +process.argv[1];
  if (!isFinite(depth))
    return 1;
  await new Promise(res => setTimeout(res, 0));
  if (depth <= 0)
    await process.print(`[PID ${process.pid}] leave`);
  else {
    const [, right] = await Promise.all([
      process.spawn(process.argv[0], String(depth - 1))
        .then(left => left.stdout.pipeTo(process.stdout, {preventClose: true})),
      process.spawn(process.argv[0], String(depth - 1))
    ]);
    await process.print(`[PID ${process.pid}] ${'    '.repeat(depth)}node`);
    await right.stdout.pipeTo(process.stdout, {preventClose: true});
  }
  await new Promise(res => setTimeout(res, 0));
}
