/// <reference lib="webworker" />

export interface ProcessInitMessage {
  url: string;
  pid: number;
  uid: number;
  gid: number;
  cwd: string;
  env: Record<string, string>;
  argv: [string, ...string[]];
  stdin: ReadableStream<Uint8Array>;
  stdout: WritableStream<Uint8Array>;
  stderr: WritableStream<Uint8Array>;
  syscall: MessagePort;
}

export interface ProcessController {
  pid: number;
  uid: number;
  gid: number;
  cwd: string;
  env: Record<string, string>;
  argv: [string, ...string[]];
  stdin: ReadableStream<Uint8Array>;
  stdout: WritableStream<Uint8Array>;
  stderr: WritableStream<Uint8Array>;

  exit(code?: number): Promise<never>;

  createReadStream(path: string, index?: number, size?: number): Promise<ReadableStream<Uint8Array>>;

  createWriteStream(path: string, index?: number, size?: number): Promise<WritableStream<Uint8Array>>;

  delete(path: string): Promise<void>;
}

type IProcessController = ProcessController;

addEventListener('message', async e => {
  e.preventDefault();

  const close = self.close.bind(self);

  if (typeof e.data !== 'object' || !e.data) {
    console.error('Malformed init message');
    close();
    return;
  }

  const {
    url,
    ...processInfo
  } = e.data as ProcessInitMessage;

  let process: ProcessController | undefined = undefined;

  const strategy = new ByteLengthQueuingStrategy({
    highWaterMark: 65535
  });

  class ProcessController implements IProcessController {
    #pid = processInfo.pid;
    #uid = processInfo.uid;
    #gid = processInfo.gid;
    #cwd = processInfo.cwd;
    #env = processInfo.env;
    #argv = processInfo.argv;
    #stdin = processInfo.stdin;
    #stdout = processInfo.stdout;
    #stderr = processInfo.stderr;
    #syscall = processInfo.syscall;

    constructor() {
      if (typeof process !== 'undefined')
        throw new TypeError('Illegal constructor');
    }

    get pid() {
      return this.#pid;
    }

    get cwd() {
      return this.#cwd;
    }

    get uid() {
      return this.#uid;
    }

    get gid() {
      return this.#gid;
    }

    set cwd(path: string) {
      // if (this.#cwd === path)
      //   return;
      // const lock = new SharedArrayBuffer(4);
      // this.#syscall.postMessage({syscall: 'cwd', path, lock});
      // Atomics.wait(new Int32Array(lock), 0, 0);
      this.#cwd = path;
    }

    get env() {
      return this.#env;
    }

    get argv(): [string, ...string[]] {
      return [...this.#argv];
    }

    get stdin() {
      return this.#stdin;
    }

    get stdout() {
      return this.#stdout;
    }

    get stderr() {
      return this.#stderr;
    }

    async exit(code = 0) {
      const pending = [];
      if (!this.#stdin.locked)
        pending.push(this.#stdin.getReader().cancel().catch(() => null));
      if (!this.#stdout.locked)
        pending.push(this.#stdout.getWriter().close().catch(() => null));
      if (!this.#stderr.locked)
        pending.push(this.#stderr.getWriter().close().catch(() => null));
      await Promise.all(pending);
      this.#syscall.postMessage({syscall: 'exit', code});
      return new Promise<never>(() => {
      });
    }

    async createReadStream(path: string, index = 0, size = Infinity) {
      path = new URL(path, 'file://' + this.#cwd + '/').pathname;
      const {readable, writable} = new TransformStream<Uint8Array, Uint8Array>({}, strategy, strategy);
      return new Promise<typeof readable>((res, rej) => {
        const {port1, port2} = new MessageChannel();
        port1.addEventListener('message', e => {
          port1.close();
          if (e.data)
            rej(e.data);
          else
            res(readable);
        }, {once: true});
        this.#syscall.postMessage({
          syscall: 'read',
          path,
          index,
          size,
          output: writable,
          response: port2
        }, [writable, port2] as any);
        port1.start();
      });
    }

    async* readdir(path: string) {
      path = new URL(path, 'file://' + this.#cwd + '/').pathname;
      const {
        readable,
        writable
      } = new TransformStream<{ kind: "file" | "directory"; name: string }, { kind: "file" | "directory"; name: string }>();
      this.#syscall.postMessage({syscall: 'readdir', path, output: writable}, [writable as any]);
      const reader = readable.getReader();
      try {
        let read, first = true;
        while (!(read = await reader.read()).done) {
          if (first) {
            first = false;
            yield { kind: 'directory', name: '.' } as const;
            yield { kind: 'directory', name: '..' } as const;
          }
          yield read.value;
        }
        if (first) {
          first = false;
          yield { kind: 'directory', name: '.' } as const;
          yield { kind: 'directory', name: '..' } as const;
        }
        return read.value;
      } catch (err) {
        await reader.cancel(err);
      } finally {
        await reader.cancel();
      }
    }

    async createWriteStream(path: string, index = 0, size = Infinity) {
      path = new URL(path, 'file://' + this.#cwd + '/').pathname;
      const {readable, writable} = new TransformStream<Uint8Array, Uint8Array>({}, strategy, strategy);
      return new Promise<typeof writable>((res, rej) => {
        const {port1, port2} = new MessageChannel();
        port1.addEventListener('message', e => {
          port1.close();
          if (e.data)
            rej(e.data);
          else
            res(writable);
        }, {once: true});
        this.#syscall.postMessage({
          syscall: 'write',
          path,
          index,
          size,
          input: readable,
          response: port2
        }, [readable, port2] as any);
        port1.start();
      });
    }

    delete(path: string) {
      path = new URL(path, 'file://' + this.#cwd + '/').pathname;
      return new Promise<void>((res, rej) => {
        const {port1, port2} = new MessageChannel();
        port1.addEventListener('message', e => {
          port1.close();
          if (e.data)
            rej(Object.assign(new Error(e.data.message), e.data));
          else
            res();
        }, {once: true});
        this.#syscall.postMessage({syscall: 'delete', path, response: port2}, [port2]);
        port1.start();
      });
    }

    spawn(cmd: string, ...args: string[]) {
      return new Promise<{
        pid: number,
        stdin: WritableStream<Uint8Array>,
        stdout: ReadableStream<Uint8Array>,
        stderr: ReadableStream<Uint8Array>
      }>((res, rej) => {
        const {port1, port2} = new MessageChannel();
        port1.addEventListener('message', e => {
          port1.close();
          if (e.data.reject)
            rej(Object.assign(new Error(e.data.message), e.data));
          else
            res(e.data.resolve);
        }, {once: true});
        this.#syscall.postMessage({
          syscall: 'spawn',
          argv: [cmd, ...args],
          cwd: this.#cwd,
          env: this.#env,
          response: port2
        }, [port2]);
        port1.start();
      });
    }

    async print(line: string) {
      const writer = process!.stdout.getWriter();
      await writer.ready;
      await writer.write(new TextEncoder().encode(line + '\n'));
      await writer.releaseLock();
    }

    async printErr(line: string) {
      const writer = process!.stderr.getWriter();
      await writer.ready;
      await writer.write(new TextEncoder().encode(line + '\n'));
      await writer.releaseLock();
    }
  }

  Object.freeze(ProcessController.prototype);

  process = new ProcessController();
  processInfo.syscall.start();

  try {
    const prog: (process: ProcessController) => PromiseLike<void> = (await import(url)).default;
    if (typeof prog !== 'function') {
      await process.printErr(`${url}: Missing default export function`);
      console.error('No container defined - missing default export function\n');
      await process.exit(127);
      return;
    }

    try {
      processInfo.syscall.postMessage({syscall: 'ready'});
      const code = +(await prog(process));
      await process.exit(isFinite(+code) ? +code : 0);
    } catch (err) {
      if (!process.stderr.locked)
        await process.printErr(`${url}: SEGFAULT: ${err?.message ?? err}`);
      console.error('PROCESS %d CRASHED:', process.pid, err);
      await process.exit(128);
    }
  } catch (err) {
    if (!process.stderr.locked)
      await process.printErr(`${url}: ${err?.message ?? err}`);
    console.error('PROCESS %d FAILED TO LOAD:', process.pid, err);
    await process.exit(127);
  }
}, {once: true});
