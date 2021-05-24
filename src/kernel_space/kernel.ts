import {BootstrapMessage, ExecOptions, KernelProcess} from "./process";
import {SyscallMessage} from "../syscall";

export class Kernel {
  #lastPid = 0;
  #processes = new Map<number, KernelProcess>();

  public constructor(
    public readonly processWrapperUrl: string
  ) {
  }

  panic(process: KernelProcess, syscall: SyscallMessage, err: Error) {
    console.error('KERNEL PANIC', err);
  }

  exec(create: (pid: number) => KernelProcess) {
    const process = create(++this.#lastPid);
    process.status.finally(() => this.#processes.delete(process.pid));
    this.#processes.set(process.pid, process);
    return process;
  }

  attach(attach: { postMessage(msg: any, transfer: any[]): void; }, parent: KernelProcess, options: ExecOptions) {
    return this.create(parent, options, (process, msg) => attach.postMessage(msg, [
      msg.syscall,
      msg.stdin,
      msg.stdout,
      msg.stderr
    ] as any));
  }

  spawn(parent: KernelProcess, entrypoint: string, options: ExecOptions) {
    return this.create(parent, options, (process, msg) => {
      const worker = new Worker(this.processWrapperUrl, {
        credentials: 'omit',
        name: process.name,
        type: 'module'
      });
      process.status.finally(() => worker.terminate());
      worker.postMessage(Object.assign(msg, { entrypoint }), [
        msg.syscall,
        msg.stdin,
        msg.stdout,
        msg.stderr
      ] as any);
    });
  }

  private create(parent: KernelProcess, options: ExecOptions, attach: (process: KernelProcess, msg: BootstrapMessage) => void) {
    const process = new KernelProcess(
      this,
      parent,
      ++this.#lastPid,
      options.uid ?? parent.uid,
      options.gid ?? parent.gid,
      options.cwd ?? '/',
      options.env ?? {},
      options.argv,
      attach
    );
    process.status.finally(() => this.#processes.delete(process.pid));
    this.#processes.set(process.pid, process);
    return process;
  }
}
