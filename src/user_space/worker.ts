import {BootstrapMessage} from "../kernel_space/process";
import {LocalProcess} from "./process";

addEventListener('message', async e => {
  e.preventDefault();

  const close = self.close.bind(self);

  try {
    if (typeof e.data !== 'object' || !e.data)
      throw new Error('Malformed init message');

    const processInfo = e.data as BootstrapMessage;
    const process = new LocalProcess(processInfo);

    let prog: (process: LocalProcess) => PromiseLike<void> = (await import(processInfo.entrypoint)).default;
    if (typeof prog !== 'function') {
      console.error('No container defined - missing default export function');
      process.exit(128);
      return;
    }

    try {
      processInfo.syscall.postMessage({syscall: 'ready'});
      const code = +(await prog(process));
      process.exit(isFinite(+code) ? +code : 0);
    } catch (err) {
      console.error('PROCESS %d CRASHED:', process.pid, err);
      process.exit(139);
    }
  } catch (err) {
    close();
  }
}, {once: true});
