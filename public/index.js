import { create, fs } from "./lib/kernel.js";

export const webcontainer = await create(new URL('./lib/process.js', import.meta.url).href);
export const filesystem = new fs.OverlayFS();

filesystem
  .mount([], new fs.MemFS())
  .mount(['root'], filesystem)
  .mount(['dev'], new fs.NullFS()) // TODO dedicated driver
  .mount(['sys'], new fs.NullFS()) // TODO dedicated driver
  .mount(['proc'], new fs.NullFS()) // TODO dedicated driver
  .mount(['bin'], new fs.HTTPFS(new URL('./command/', import.meta.url).href))
  .mount(['tmp'], new fs.MemFS());

const bash = await webcontainer.run({
  entrypoint: 'bash', // will be resolved using the PATH environment variable
  cwd: '/',
  argv: ['bash'],
  env: {
    'PATH': '/bin',
    'HOSTNAME': location.host,
    'USERNAME': localStorage.getItem('USERNAME') || 'nobody'
  }
}, filesystem); // TODO networking, 

/** @type {WritableStreamDefaultWriter<Uint8Array>} */
const bashStdin = bash.stdin.getWriter();

// @ts-ignore
let term = new Terminal();
// @ts-ignore
const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(document.body);
Object.assign(window, { webcontainer, filesystem });
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

const encoder = new TextEncoder();
const disposable = term.onKey(async ({ key }) => {
  await bashStdin.ready;
  await bashStdin.write(encoder.encode(key));
});
