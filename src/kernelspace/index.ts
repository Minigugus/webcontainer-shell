import type { LocalProcessController } from '../userspace';
import { FileSystemDriver, FileSystemNode } from './fs';

import { KERNEL_PROCESS_ENDPOINT, LOCAL_PROCESS_CONTROLLER_ENDPOINT } from '../services';
import { deferrable } from '../utils';

import { OverlayFS } from './fs/overlay';
import { NativeFS } from './fs/native';
import { MemFS } from './fs/memfs';
import { HTTPFS } from './fs/http';
import { NullFS } from './fs/null';
import { CustomTransferable, TO_TRANSFORABLES } from '../rpc';

export const fs = {
  OverlayFS,
  NativeFS,
  MemFS,
  HTTPFS,
  NullFS,
}

export async function create(runtimeUrl: string = './process.js'): Promise<Webcontainer> {
  const runtime = await (await fetch(runtimeUrl)).blob();
  return new Webcontainer(URL.createObjectURL(runtime));
}

class Webcontainer {
  #runtimeUrl: string;

  constructor(runtimeUrl: string) {
    this.#runtimeUrl = runtimeUrl;
  }

  get runtime() {
    return this.#runtimeUrl;
  }

  async run(info: ProcessSpawn, fs: FileSystemDriver = new NullFS()): Promise<KernelProcess> {
    return new Kernel(this.#runtimeUrl, fs).spawn(0, info);
  }
}

class Kernel {
  #nextPid = 1;
  #processes = new Map<number, KernelProcess>();
  #runtimeUrl: string;
  #fs: FileSystemDriver;

  constructor(
    runtimeUrl: string,
    fs: FileSystemDriver
  ) {
    this.#runtimeUrl = runtimeUrl;
    this.#fs = fs;
  }

  get runtime() {
    return this.#runtimeUrl;
  }

  get fs() {
    return this.#fs;
  }

  async spawn(parent: number, info: ProcessSpawn): Promise<KernelProcess> {
    if (!info.entrypoint.includes('/')) {
      for (const path of (info.env['PATH'] ?? '').split(':').reverse()) {
        let resolved = new URL(path, 'file:///' + info.cwd).pathname;
        if (!resolved.endsWith('/'))
          resolved += '/';
        resolved += info.entrypoint;
        if (!info.entrypoint.includes('.'))
          resolved += '.js';
        if (await this.fs.access(resolved.split('/').filter(s => s)).catch(() => false)) {
          info.entrypoint = resolved;
          break;
        }
      }
    } else if (/^\.?\.?\//.test(info.entrypoint))
      info.entrypoint = new URL(info.entrypoint, 'file://' + info.cwd).pathname;
    const process = await KernelProcess.spawn(this, {
      ...info,
      entrypoint: info.entrypoint,
      ppid: parent,
      pid: this.#nextPid++
    });
    this.#processes.set(process.pid, process);
    process.status.then(() => this.#processes.delete(process.pid));
    return process;
  }
}

export interface ProcessSpawnInfo {
  entrypoint: string;
  ppid: number;
  pid: number;
  cwd: string;
  argv: [string, ...string[]];
  env: Record<string, string>;
}

export type ProcessSpawn = Pick<ProcessSpawnInfo, 'entrypoint' | 'cwd' | 'argv' | 'env'>;

type PublicKernelProcess = Pick<
  KernelProcess,
  keyof KernelProcess extends infer R
  ? R extends keyof KernelProcess
  ? KernelProcess[R] extends (...args: any) => Promise<any>
  ? R
  : never
  : never
  : never
>;

export type { PublicKernelProcess as KernelProcess };

class KernelProcess implements FileSystemDriver {
  public static async spawn(kernel: Kernel, info: ProcessSpawnInfo): Promise<KernelProcess> {
    const worker = new Worker(kernel.runtime, {
      credentials: 'omit',
      name: `[PID ${info.pid}] ${info.argv[0]}`,
      type: 'classic'
    });
    try {
      const ioBuffer = new ByteLengthQueuingStrategy({ highWaterMark: 65535 });
      const stdin = new TransformStream<Uint8Array, Uint8Array>({}, ioBuffer, ioBuffer);
      const stdout = new TransformStream<Uint8Array, Uint8Array>({}, ioBuffer, ioBuffer);
      const stderr = new TransformStream<Uint8Array, Uint8Array>({}, ioBuffer, ioBuffer);
      const controller = LOCAL_PROCESS_CONTROLLER_ENDPOINT.attach(worker);
      const process = new KernelProcess(
        kernel,
        worker,
        controller,
        info,
        stdin.writable,
        stdout.readable,
        stderr.readable
      );
      const { port1, port2 } = new MessageChannel();
      KERNEL_PROCESS_ENDPOINT.expose(port2, process);
      port2.start();
      await controller.spawn(
        port1,
        info,
        stdin.readable,
        stdout.writable,
        stderr.writable
      );
      return process;
    } catch (err) {
      worker.terminate();
      throw err;
    }
  }

  #kernel: Kernel;
  #worker: Worker;
  #controller: LocalProcessController;
  #info: ProcessSpawnInfo;

  #stdin: WritableStream<Uint8Array>;
  #stdout: ReadableStream<Uint8Array>;
  #stderr: ReadableStream<Uint8Array>;

  #exitCode: number | null = null;
  #exit = deferrable<number>();

  private constructor(
    kernel: Kernel,
    worker: Worker,
    controller: LocalProcessController,
    info: ProcessSpawnInfo,
    stdin: WritableStream<Uint8Array>,
    stdout: ReadableStream<Uint8Array>,
    stderr: ReadableStream<Uint8Array>
  ) {
    // super();
    this.#kernel = kernel;
    this.#worker = worker;
    this.#controller = controller;
    this.#info = info;
    this.#stdin = stdin;
    this.#stdout = stdout;
    this.#stderr = stderr;
  }

  access(path: string[]): Promise<boolean> {
    return this.#kernel.fs.access(path);
  }

  resolveUri(path: string[]): Promise<string> {
    return this.#kernel.fs.resolveUri(path);
  }

  readDir(path: string[]): Promise<ReadableStream<FileSystemNode>> {
    return this.#kernel.fs.readDir(path);
  }

  readFile(path: string[], offset?: number, length?: number): Promise<ReadableStream<Uint8Array>> {
    return this.#kernel.fs.readFile(path, offset, length);
  }

  writeFile(path: string[], offset: 'before' | 'after' | 'override', create: boolean): Promise<WritableStream<Uint8Array>> {
    return this.#kernel.fs.writeFile(path, offset, create);
  }

  deleteNode(path: string[], recursive: boolean): Promise<void> {
    return this.#kernel.fs.deleteNode(path, recursive);
  }

  get kernel() {
    return this.#kernel;
  }

  get ppid() {
    return this.#info.ppid;
  }

  get pid() {
    return this.#info.pid;
  }

  get status() {
    return this.#exit.promise;
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

  async spawn(info: ProcessSpawn): Promise<{
    pid: number,
    stdin: WritableStream<Uint8Array>,
    stdout: ReadableStream<Uint8Array>,
    stderr: ReadableStream<Uint8Array>,
  } & CustomTransferable> {
    const process = await this.#kernel.spawn(this.pid, info);
    return {
      pid: process.pid,
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,

      [TO_TRANSFORABLES]() {
        return [this.stdin, this.stdout, this.stderr];
      }
    }
  }

  async exit(code: number): Promise<never> {
    this.#exitCode = code;
    this.#worker.terminate();
    this.#exit.resolve(code);
    // this.dispatchEvent(new Event('exit', { cancelable: false }));
    return code as never;
  }
}

const decoder = new TextDecoder();

async function pump(input: ReadableStream<Uint8Array>, print: (line: Uint8Array) => void) {
  let pending: Uint8Array[] = [];
  let pendingLength = 0;
  const reader = input.getReader();
  let read;
  while (!(read = await reader.read()).done) {
    let buffer = read.value;
    let newline = buffer.indexOf(10); // 10 = \n
    if (newline !== -1) {
      if (newline > 0) {
        pending.push(buffer.subarray(0, newline));
        pendingLength += buffer.byteLength;
      }
      let line = new Uint8Array(pendingLength);
      let offset = 0;
      for (const buffer of pending) {
        line.set(buffer, offset);
        offset += buffer.byteLength;
      }
      print(line);
      pending = [];
      pendingLength = 0;
      while ((offset = newline + 1, newline = buffer.indexOf(10, offset + 1)) !== -1)
        print(buffer.subarray(offset, newline));
      buffer = buffer.subarray(offset);
    }
    if (buffer.byteLength > 0) {
      pending.push(buffer);
      pendingLength += buffer.byteLength;
    }
  }
  if (pendingLength > 0) {
    let line = new Uint8Array(pendingLength);
    let offset = 0;
    for (const buffer of pending) {
      line.set(buffer, offset);
      offset += buffer.byteLength;
    }
    print(line);
  }
}

export async function pumpToConsole({ pid, stdout, stderr, status }: KernelProcess) {
  const print = (line: Uint8Array) => console.info('[PID %s] %s', pid, decoder.decode(line));
  const printErr = (line: Uint8Array) => console.error('[PID %s] %s', pid, decoder.decode(line));
  await Promise.all([
    pump(stdout, print).catch(() => null),
    pump(stderr, printErr).catch(() => null),
  ]);
  return status;
}
