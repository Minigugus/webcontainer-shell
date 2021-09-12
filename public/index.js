// @ts-ignore
let term = new Terminal();
// @ts-ignore
const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(document.body);
term.focus();

/** @type {number} */
let timeout;
document.body.style.height = `${window.innerHeight}px`;
fitAddon.fit();
addEventListener('resize', () => {
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    document.body.style.height = `${window.innerHeight}px`;
    fitAddon.fit();
  }, 200);
});

document.body.addEventListener('dragover', (e) => e.preventDefault()); // TODO complete drag-and-drop (import user directory/file)

import { create, fs } from "./lib/kernel.js";

export const webcontainer = await create(new URL('./lib/process.js', import.meta.url).href);
export const filesystem = new fs.OverlayFS();

Object.assign(window, { webcontainer, filesystem });

let root;
try {
  // @ts-ignore
  const rootEntry = await navigator.storage.getDirectory();
  root = new fs.NativeFS(rootEntry);
} catch (err) {
  console.warn('No private native file system access', err);
}
if (!root)
  root = new fs.MemFS();
try {
  if (!await root.access(['etc', 'motd']))
    await new Response(`Welcome to bash.js!
This is an exemple of what could be possible with the upcoming WebContainer specification.

Checkout \x1B[4mhttps://github.com/Minigugus/webcontainer-shell/tree/v2\x1B[0m

Type \x1B[1;3mhelp\x1B[0m to get started\n`)
      .body
      .pipeTo(await root.writeFile(['etc', 'motd'], 0, true));
} catch (err) {
  console.warn('could not create default /etc/motd', err);
}

filesystem
  .mount([], root)
  .mount(['root'], filesystem)
  .mount(['dev'], new fs.NullFS()) // TODO dedicated driver
  .mount(['sys'], new fs.NullFS()) // TODO dedicated driver
  .mount(['proc'], new fs.NullFS()) // TODO dedicated driver
  .mount(['bin'], new fs.HTTPFS(new URL('./command/', import.meta.url).href))
  .mount(['tmp'], new fs.MemFS());

try {
  const bash = await webcontainer.run({
    entrypoint: 'bash', // will be resolved using the PATH environment variable
    cwd: '/',
    argv: ['bash'],
    env: {
      'PATH': '/bin',
      'HOST': location.host,
      'USER': localStorage.getItem('USER') || 'nobody'
    }
  }, filesystem); // TODO networking

  const decoder = new TextDecoder();
  /** @param {ReadableStream<Uint8Array>} stream */
  const pipeToTerm = async stream => {
    const reader = stream.getReader();
    let result;
    while (!(result = await reader.read()).done)
      term.write(decoder.decode(result.value).replace(/\r?\n/g, '\r\n'));
  };
  Promise.all([
    pipeToTerm(bash.stdout).catch(err => err),
    pipeToTerm(bash.stderr).catch(err => err)
  ])
    .then(console.warn, console.error)
    .then(() => bash.status)
    .then(status => {
      disposable.dispose();
      term.write('\r\nbash.js exited with status \x1B[1;' + (status ? 31 : 32) + 'm' + status + '\x1B[0;3m\r\nPress any key to restart\r\n');
      term.onKey(() => window.location.reload());
    });

  /** @type {WritableStreamDefaultWriter<Uint8Array>} */
  const bashStdin = bash.stdin.getWriter();

  const encoder = new TextEncoder();
  const disposable = term.onKey(async ({ key }) => {
    await bashStdin.ready;
    await bashStdin.write(encoder.encode(key));
  });
} catch (err) {
  let msg = err.message || err;
  switch (msg) {
    case 'ENOTFOUND':
      msg = 'command \x1B[3mbash\x1B[0;1;31m not found';
  }
  term.write(`\x1B[31mFailed to start bash.js: \x1B[1m${msg}\x1B[0m`);
  term.write('\r\n\r\n\x1B[3mPress any key to retry\r\n');
  term.onKey(() => window.location.reload());
}