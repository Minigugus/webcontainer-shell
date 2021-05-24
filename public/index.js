import * as WebContainer from '../dist/index.mjs';
import {run} from './run.js';
import {$} from './$.js';

window.$ = $;

let term = new Terminal();
const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(document.body);
Object.assign(window, WebContainer);
term.focus();

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

document.body.addEventListener('dragover', (e) => e.preventDefault());
document.body.addEventListener('drop', async (e) => {
  e.preventDefault();
  // Process all of the items.
  for (const item of e.dataTransfer.items) {
    if (item.kind === 'file') {
      const entry = await item.getAsFileSystemHandle();
      if (entry.kind === 'directory') {
        const path = `/mnt/${entry.name}`;
        await kernel.fs.mount(path, new WebContainer.NativeFileSystemVFS(entry));
        term.write(`\r\n"${entry.name}" mounted at ${path}\r\n`);
      }
    }
  }
});

let pwd = '/', cmdHistory = [];
try {
  await (await kernel.fs.read('/.webrc.js', 0, Infinity)).cancel();
  await exec('/.webrc.js');
} catch (err) {
  await exec('.webrc');
}
prompt();

async function exec(cmd) {
  console.log(cmd);
  const {readable, writable} = new TransformStream();
  const writer = writable.getWriter();
  let line = '';
  const dispose = term.onKey(async e => {
    let ev = e.domEvent;
    if (ev.keyCode === 13) {
      term.write('\r\n');
      await writer.ready;
      await writer.write(line + '\n');
      line = '';
    } else if (ev.keyCode === 8) {
      if (line) {
        line = line.slice(0, -1);
        term.write('\b \b');
      }
    } else if (ev.ctrlKey && e.domEvent.code === 'KeyD') {
      if (!line) {
        await writer.close();
        dispose.dispose();
      }
    } else if (!ev.altKey && !ev.ctrlKey && !ev.metaKey && e.key.length === 1) {
      line += e.key;
      term.write(e.key);
    }
  });
  try {
    await run(cmd, pwd, readable, new WritableStream({
      write(chunk) {
        term.write(chunk.replace(/\r?\n/g, '\r\n'));
      }
    }).getWriter());
  } finally {
    dispose.dispose();
    await writer.close().catch(err => err);
  }
}

function prompt() {
  term.write(`\x1B[1;32mnobody@${location.host}\x1B[0m:\x1B[1;34m${pwd}\x1B[0m$ `);
  let cmd = '', h = cmdHistory.length;
  const disposable = term.onKey(async e => {
    const ev = e.domEvent;
    const printable = !ev.altKey && !ev.ctrlKey && !ev.metaKey;

    if (ev.keyCode === 13) {
      disposable.dispose();
      term.write('\r\n');
      try {
        if (/^cd(\s|$)/.test(cmd))
          pwd = new URL(cmd.slice(2).trim().replace(/\/+$/, '') || '/', 'file://' + pwd + '/').pathname.replace(/\/+$/, '') || '/';
        else if (/^reboot(\s|$)/.test(cmd))
          location.reload();
        else if (cmd) {
          if (cmd !== cmdHistory[cmdHistory.length - 1])
            cmdHistory.push(cmd);
          await exec(cmd);
        }
      } finally {
        prompt();
      }
    } else if (ev.keyCode === 8) {
      // Do not delete the prompt
      if (cmd) {
        cmd = cmd.slice(0, -1);
        term.write('\b \b');
      }
    } else if (ev.ctrlKey && ev.code === 'KeyL') {
      disposable.dispose();
      term.write('\x1Bc');
      prompt();
    } else {
      let newCmd;
      if (ev.code === 'ArrowUp') {
        if (h > 0) {
          newCmd = cmdHistory[--h];
        }
      }
      if (ev.code === 'Tab') {
        return;
      } else if (ev.code === 'ArrowDown') {
        if (h < cmdHistory.length) {
          newCmd = cmdHistory[++h] || '';
        }
      } else if (printable && e.key.length === 1) {
        term.write(e.key);
        cmd += ev.key;
        return;
      }
      if (typeof newCmd === 'string') {
        const blanks = cmd.length - newCmd.length;
        term.write(
          '\b'.repeat(cmd.length) +
          newCmd +
          (blanks <= 0
              ? ''
              : ' '.repeat(cmd.length - newCmd.length) +
              '\b'.repeat(cmd.length - newCmd.length)
          )
        );
        cmd = newCmd;
      }
    }
  });
}
