import {ProcessWorker} from './process_worker';
import {MountableVFS} from './vfs';

export function boot() {
  return new Kernel();
}

export class Kernel {
  #lastPid = 0;
  #alive = new Map<number, ProcessWorker>();
  #vfs = new MountableVFS();

  get fs() {
    return this.#vfs;
  }

  async exec({
               cmd,
               args = [],
               cwd = '/',
               env = {}
             }: { cmd: string, args?: string[], cwd?: string, env?: Record<string, string> }) {
    const url = await this.#vfs.url(cmd);
    if (!url)
      throw new Error(cmd + ': No such file');
    let pid: number;
    while (this.#alive.has(pid = ++this.#lastPid)) ;
    const process = new ProcessWorker(this, url, {pid, uid: 1, gid: 1, cwd, env, argv: [cmd, ...args]});
    this.#alive.set(pid, process);
    process.status.finally(() => this.#alive.delete(pid));
    // await process.ready;
    process.ready.finally(() => URL.revokeObjectURL(url));
    return process;
  }
}
