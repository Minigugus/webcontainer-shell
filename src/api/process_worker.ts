/// <reference lib="dom" />

import type {ProcessInitMessage} from '../process_worker';
import type {Kernel} from './kernel';

interface ProcessInitInfo extends ProcessInfo {
  cwd: string;
  env: Record<string, string>;
}

export interface ProcessInfo {
  pid: number;
  uid: number;
  gid: number;
  argv: [string, ...string[]];
}

function deferrable<T>() {
  let resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return ({
    resolve: resolve!,
    reject: reject!,
    promise
  });
}

const strategy = new ByteLengthQueuingStrategy({
  highWaterMark: 65535
});

export class ProcessWorker extends Worker implements ProcessInfo {
  #kernel: Kernel;
  #comm: MessagePort;
  readonly #pid: number;
  readonly #uid: number;
  readonly #gid: number;
  readonly #argv: [string, ...string[]];
  #stdin = new TransformStream<Uint8Array>({}, strategy, strategy);
  #stdout = new TransformStream<Uint8Array>({}, strategy, strategy);
  #stderr = new TransformStream<Uint8Array>({}, strategy, strategy);
  #ready = deferrable<void>();
  #exit = deferrable<number>();

  public constructor(kernel: Kernel, url: string, {pid, uid, gid, argv, cwd, env}: ProcessInitInfo) {
    super('./dist/process_worker.mjs', {
      credentials: 'omit',
      name: `[PID ${pid}] ${argv[0]}`,
      type: 'module'
    });
    this.#kernel = kernel;
    this.#pid = pid;
    this.#uid = uid;
    this.#gid = gid;
    this.#argv = argv;
    this.#exit.promise = this.#exit.promise.finally(() => this.terminate());
    this.addEventListener('error', () => this.kill(11), {once: true});
    this.addEventListener('messageerror', () => this.kill(11), {once: true});
    this.#ready.promise.catch(async err => {
      const pending = [];
      if (!this.#stdin.writable.locked)
        pending.push(this.#stdin.writable.getWriter().close().catch(() => null));
      if (!this.#stdout.readable.locked)
        pending.push(this.#stdout.readable.getReader().cancel().catch(() => null));
      if (!this.#stderr.readable.locked)
        pending.push(this.#stderr.readable.getReader().cancel().catch(() => null));
      await Promise.all(pending);
      throw err;
    });

    const {port1: local, port2: remote} = new MessageChannel();
    this.#comm = local;
    const pendingPipe = new Set<Promise<any>>();
    this.#comm.addEventListener('message', async e => {
      if (!(typeof e.data !== 'object' || !e.data || typeof e.data.syscall !== 'string')) {
        const syscall = (async () => {
          try {
            console.debug('%s:', `[PID ${this.#pid}] ${this.#argv[0]}`, e.data);
            switch (e.data.syscall) {
              case 'ready':
                this.#ready.resolve();
                return;
              case 'exit':
                let {code} = e.data;
                this.#ready.reject(new Error('Invalid process format'));
                await Promise.race([
                  Promise.all(pendingPipe),
                  new Promise(res => setTimeout(() => res(code = 139), 5000))
                ]);
                this.#exit.resolve(code);
                return;
              case 'read': {
                const {path, index, size, output, response} = e.data as {
                  path: string,
                  index: number,
                  size: number,
                  output: WritableStream<Uint8Array>,
                  response: MessagePort
                };
                try {
                  const stream = await kernel.fs.read(path, index, size);
                  if (!stream)
                    throw new Error('File not found');
                  else {
                    const pipe = stream.pipeTo(output);
                    response.postMessage(null);
                    await pipe;
                  }
                } catch (err) {
                  console.error('%s:', e.data.syscall, path, err);
                  if (!output.locked)
                    await output.abort(err);
                  response.postMessage(err);
                } finally {
                  response.close();
                }
                return;
              }
              case 'readdir': {
                const {path, output} = e.data as {
                  path: string,
                  output: WritableStream<{ kind: "file" | "directory"; name: string }>
                };
                try {
                  const stream = await kernel.fs.readdir(path);
                  if (!stream)
                    throw new Error('File not found');
                  else {
                    await stream.pipeTo(output);
                  }
                } catch (err) {
                  console.error('%s:', e.data.syscall, path, err);
                  if (!output.locked)
                    await output.abort(err);
                }
                return;
              }
              case 'write': {
                const {path, index, size, input, response} = e.data as {
                  path: string,
                  index: number,
                  size: number,
                  input: ReadableStream<Uint8Array>,
                  response: MessagePort
                };
                try {
                  const buffer = input;
                  // const buffer = input.pipeThrough(new TransformStream<Uint8Array, Uint8Array>());
                  const stream = await kernel.fs.write(path, index, size);
                  if (!stream)
                    throw new Error('File not found');
                  else {
                    const pipe = buffer.pipeTo(stream);
                    response.postMessage(null);
                    await pipe;
                  }
                } catch (err) {
                  console.error('%s:', e.data.syscall, path, err);
                  if (!input.locked)
                    await input.cancel(err);
                  response.postMessage(err);
                } finally {
                  response.close();
                }
                return;
              }
              case 'delete': {
                const {path, response} = e.data as { path: string, response: MessagePort };
                try {
                  await kernel.fs.delete(path);
                  response.postMessage(null);
                } catch (err) {
                  console.error('%s:', e.data.syscall, path, err);
                  response.postMessage(err);
                } finally {
                  response.close();
                }
                return;
              }
              case 'spawn': {
                const {argv, response} = e.data as {
                  cwd?: string,
                  env?: Record<string, string>,
                  argv: [string, ...string[]],
                  response: MessagePort
                };
                try {
                  const process = await kernel.exec({
                    cmd: argv[0],
                    args: argv.slice(1),
                    cwd,
                    env
                  });
                  await process.ready;
                  response.postMessage({
                    resolve: {
                      pid: process.pid,
                      stdin: process.stdin,
                      stdout: process.stdout,
                      stderr: process.stderr,
                    }
                  }, [
                    process.stdin,
                    process.stdout,
                    process.stderr
                  ] as any);
                } catch (err) {
                  console.error('%s:', e.data.syscall, err);
                  response.postMessage({reject: err});
                } finally {
                  response.close();
                }
                return;
              }
            }
            this.#exit.reject(new Error('Broken process communication'));
          } finally {
            if (e.data.lock)
              Atomics.notify(new Int32Array(e.data.lock), 0);
          }
        })();
        pendingPipe.add(syscall);
        syscall.finally(() => pendingPipe.delete(syscall));
      }
    });

    this.postMessage({
      url,
      pid,
      uid,
      gid,
      cwd,
      env,
      argv,
      syscall: remote,
      stdin: this.#stdin.readable,
      stdout: this.#stdout.writable,
      stderr: this.#stderr.writable
    } as ProcessInitMessage, [
      remote,
      this.#stdin.readable,
      this.#stdout.writable,
      this.#stderr.writable
    ] as any);

    this.#comm.start();
  }

  get pid() {
    return this.#pid;
  }

  get uid() {
    return this.#uid;
  }

  get gid() {
    return this.#gid;
  }

  get argv() {
    return [...this.#argv] as [string, ...string[]];
  }

  get ready() {
    return this.#ready.promise;
  }

  get status() {
    return this.#exit.promise;
  }

  get stdin() {
    return this.#stdin.writable;
  }

  get stdout() {
    return this.#stdout.readable;
  }

  get stderr() {
    return this.#stderr.readable;
  }

  kill(signal = 0) {
    this.#exit.resolve(128 + signal);
  }
}
