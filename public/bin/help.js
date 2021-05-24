// @ts-check

/**
 * Prints details about other available commands
 * @param {import('../../src/process_worker').ProcessController} process
 */
export default async function help(process) {
  try {
    /** @type {Record<string, { usage: string[], description: string }>} */
    const cmds = await new Response(await process.createReadStream('/bin/cmds.json'), {
      headers: {
        'Content-Type': 'application/json'
      }
    }).json();
    for (const [name, {usage, description}] of Object.entries(cmds))
      await process.print(`${[`\x1B[1m${name}\x1B[0m`, ...usage.map(a => `\x1B[4m${a}\x1B[0m`)].join(' ')}\n\t${description}\n`);
  } catch (err) {
    await process.printErr(`\x1B[1;31mCommands list not available (${err?.message ?? err})\x1B[0m`);
    await process.print('');
  }
  await process.print('\x1B[4mShortcuts\x1B[0m');
  await process.print('  \x1B[1mCtrl + D\x1B[0m : Close stdin (stop commands like \x1B[1mcat\x1B[0m and \x1B[1mtee\x1B[0m)');
  await process.print('  \x1B[1mCtrl + L\x1B[0m : Clear the terminal');
  await process.print('  \x1B[1mCtrl + C\x1B[0m : DOES NOTHING (should kill a command but it is not supported yet)');
  await process.print('  \x1B[1m     TAB\x1B[0m : DOES NOTHING (no auto-compelte yet)');
  await process.print('');
  await process.print("Commands can be piped together with a | character (eg. \x1B[4mecho Hello world! | tee README\x1B[0m). && and || doesn't work yet.");
  await process.print('');
  await process.print('TIP: Drop here a directory from your computer to make it accessible via this terminal.');
}
