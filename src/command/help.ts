/// <reference path="../userspace/index.d.ts" />

/**
 * Prints this help message
 */

if (typeof webcontainer !== 'function')
  throw new Error('Missing webcontainer runtime');

webcontainer(async function help(process) {
  const encoder = new TextEncoder();
  const print = (line: string) => process.write(1, encoder.encode(line + '\n'));
  const printErr = (line: string) => process.write(2, encoder.encode(line + '\n'));
  try {
    /** @type {Record<string, { usage: string[], description: string }>} */
    const cmds = await new Response(await process.createReadStream('/bin/help.json'), {
      headers: {
        'Content-Type': 'application/json'
      }
    }).json();
    for (const [name, { usage, description }] of Object.entries<{ usage: string[], description: string }>(cmds))
      await print(`${[`\x1B[1m${name}\x1B[0m`, ...usage.map(a => `\x1B[4m${a}\x1B[0m`)].join(' ')}\n\t${description || '(no help available)'}\n`);
  } catch (err) {
    await printErr(`\x1B[1;31mCommands list not available (${(err instanceof Error && err.message) ?? err})\x1B[0m`);
    await print('');
  }
  await print('\x1B[4mShortcuts\x1B[0m');
  await print('  \x1B[1mCtrl + D\x1B[0m : Close stdin (stop commands like \x1B[1mcat\x1B[0m and \x1B[1mtee\x1B[0m)');
  await print('  \x1B[1mCtrl + L\x1B[0m : Clear the terminal');
  await print('  \x1B[1mCtrl + C\x1B[0m : DOES NOTHING (should kill a command but it is not supported yet)');
  await print('  \x1B[1m     TAB\x1B[0m : DOES NOTHING (no auto-compelte yet)');
  await print('');
  await print("Commands can be piped together with a | character (eg. \x1B[4mecho Hello world! | tee README\x1B[0m). && and || doesn't work yet.");
  // await print('');
  // await print('TIP: Drop here a directory from your computer to make it accessible via this terminal.');
});
