/// <reference lib="webworker" />

import {BootstrapMessage} from '../kernel_space/process';
import {LocalProcess} from './process';

export function attach(
  port: { addEventListener(type: 'message', handler: (e: MessageEvent) => void, options: { once: true }): void },
  prog: (process: LocalProcess) => PromiseLike<void>
) {
  return new Promise<void>((res, rej) => {
    port.addEventListener('message', async e => {
      e.preventDefault();
      try {
        if (typeof e.data !== 'object' || !e.data)
          throw new Error('Malformed init message');

        const processInfo = e.data as BootstrapMessage;
        const process = new LocalProcess(processInfo);

        try {
          processInfo.syscall.postMessage({syscall: 'ready'});
          const code = +(await prog(process));
          process.exit(isFinite(+code) ? +code : 0);
        } catch (err) {
          console.error('PROCESS %d CRASHED:', process.pid, err);
          process.exit(139);
        }
      } catch (err) {
        rej(err);
      } finally {
        res();
      }
    }, {once: true});
  });
}

// export function attach(port: { addEventListener(type: 'message', handler: (e: MessageEvent) => void, options: { once: true }): void }) {
//   return new Promise((res, rej) => {
//     port.addEventListener('message', async e => {
//       try {
//         e.preventDefault();
//
//         const close = self.close.bind(self);
//
//         if (typeof e.data !== 'object' || !e.data) {
//           console.error('Malformed init message');
//           close();
//           return;
//         }
//
//         const processInfo = e.data as BootstrapMessage;
//
//         let process = new LocalProcess(processInfo);
//
//         let prog: (process: LocalProcess) => PromiseLike<void> = (await import(processInfo.entrypoint)).default;
//         if (typeof prog !== 'function') {
//           console.error('No container defined - missing default export function');
//           process.exit(128);
//           return;
//         }
//
//         try {
//           processInfo.syscall.postMessage({syscall: 'ready'});
//           res(process);
//           const code = +(await prog(process));
//           process.exit(isFinite(+code) ? +code : 0);
//         } catch (err) {
//           console.error('PROCESS %d CRASHED:', process.pid, err);
//           process.exit(139);
//         }
//       } catch (err) {
//         rej(err);
//       }
//     }, {once: true});
//   });
// }
