import {Kernel} from "./kernel";
import {attach} from "../user_space";
import {LocalProcess} from "../user_space/process";

export function boot(processWrapperURL: string) {
  const kernel = new Kernel(processWrapperURL);
  const {port1, port2} = new MessageChannel();
  const kernelProcess = kernel.attach(
    port1,
    null!,
    {
      argv: ['<init>'],
      cwd: '/',
      env: {'PATH': '/bin'},
      gid: 0,
      uid: 0
    });
  return new Promise<LocalProcess>(res => {
      attach(port2, async process => {
        res(process);
        await kernelProcess.status;
      });
      port2.start();
    }
  );
}
