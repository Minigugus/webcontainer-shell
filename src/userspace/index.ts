import type { Channel } from '../rpc';
import type { KernelProcess, ProcessSpawnInfo } from '../kernelspace';
import type { FileSystemNode } from '../kernelspace/fs';

import { KERNEL_PROCESS_ENDPOINT, LOCAL_PROCESS_CONTROLLER_ENDPOINT } from '../services';
import { readableStream2AsyncIterator } from '../utils';

export type EntrypointFunction = (process: LocalProcess) => void | number | Promise<void | number>;

export type { LocalProcess, LocalProcessController };

/// <reference path="./index.d.ts" />

function segments(fullpath: string) {
  return fullpath.split('/').filter(s => s);
}

const RELEASE_RESOURCES = Symbol();

class LocalProcess {
  #kernel: KernelProcess;

  #entrypoint: string;

  #ppid: number;
  #pid: number;

  #cwd: string;
  #argv: [string, ...string[]];
  #env: Record<string, string>;

  #stdin: ReadableStream<Uint8Array>;
  #stdout: WritableStream<Uint8Array>;
  #stderr: WritableStream<Uint8Array>;

  #nextResourceId = 3;
  #resources: Record<number, {
    uri: string,
    reader?: ReadableStreamDefaultReader<Uint8Array>,
    writer?: WritableStreamDefaultWriter<Uint8Array>,
  }> = Object.create(null);

  constructor(
    kernel: KernelProcess,
    info: ProcessSpawnInfo,
    stdin: ReadableStream<Uint8Array>,
    stdout: WritableStream<Uint8Array>,
    stderr: WritableStream<Uint8Array>,
  ) {
    Object.freeze(this);
    this.#kernel = kernel;
    this.#entrypoint = info.entrypoint;
    this.#ppid = info.ppid;
    this.#pid = info.pid;
    this.#cwd = info.cwd;
    this.#argv = info.argv;
    this.#env = info.env;
    this.#stdin = stdin;
    this.#stdout = stdout;
    this.#stderr = stderr;
    this.#resources[0] = { uri: 'stdin:', reader: stdin.getReader() };
    this.#resources[1] = { uri: 'stdout:', writer: stdout.getWriter() };
    this.#resources[2] = { uri: 'stderr:', writer: stderr.getWriter() };
  }

  get entrypoint(): string {
    return this.#entrypoint;
  }

  get ppid(): number {
    return this.#ppid;
  }

  get pid(): number {
    return this.#pid;
  }

  get cwd(): string {
    return this.#cwd;
  }

  set cwd(path: string) {
    this.#cwd = '/' + segments(this.resolve(path)).join('/');
  }

  get argv() {
    return this.#argv;
  }

  get env() {
    return Object.assign(Object.create(null), this.#env);
  }

  stdin() {
    const resource = this.#resources[0];
    if (resource) {
      resource.reader?.releaseLock();
      delete this.#resources[0];
    }
    return this.#stdin;
  }

  stdout() {
    const resource = this.#resources[1];
    if (resource) {
      resource.writer?.releaseLock();
      delete this.#resources[1];
    }
    return this.#stdout;
  }

  stderr() {
    const resource = this.#resources[2];
    if (resource) {
      resource.writer?.releaseLock();
      delete this.#resources[2];
    }
    return this.#stderr;
  }

  getenv(name: string): string | null {
    return this.#env[name] ?? null;
  }

  setenv(name: string, value: string | null): string | null {
    if (value !== null)
      return this.#env[name] = value;
    delete this.#env[name];
    return null;
  }

  resolve(path: string) {
    return new URL(path, 'file://' + this.#cwd + '/').pathname;
  }

  async createReadStream(path: string): Promise<ReadableStream<Uint8Array>> {
    const parts = segments(path = this.resolve(path));
    return this.#kernel.readFile(parts);
  }

  async createWriteStream(path: string, seek: 'after' | 'before' | 'override', createOrReplace: boolean): Promise<WritableStream<Uint8Array>> {
    const parts = segments(path = this.resolve(path));
    return this.#kernel.writeFile(parts, seek, createOrReplace);
  }

  async unlink(path: string, recursive = false) {
    const parts = segments(path = this.resolve(path));
    await this.#kernel.deleteNode(parts, recursive);
  }

  getResourceURI(rid: number) {
    const { uri } = this.#resources[rid] || {};
    if (!uri)
      return null;
    return uri;
  }

  async readDir(path: string): Promise<AsyncIterable<FileSystemNode>> {
    const parts = segments(path = this.resolve(path));
    const stream = await this.#kernel.readDir(parts);
    return readableStream2AsyncIterator(stream, {
      onclose: s => s.cancel(),
      onabort: (s, err) => s.cancel(err),
    });
  }

  async openRead(path: string): Promise<number> {
    const parts = segments(path = this.resolve(path));
    const readable = await this.#kernel.readFile(parts);
    const rid = this.#nextResourceId++;
    this.#resources[rid] = { uri: `file://${path}`, reader: readable.getReader() };
    return rid;
  }

  async openWrite(path: string, seek: 'after' | 'before' | 'override', createOrReplace: boolean): Promise<number> {
    const parts = segments(path = this.resolve(path));
    const writable = await this.#kernel.writeFile(parts, seek, createOrReplace);
    const rid = this.#nextResourceId++;
    this.#resources[rid] = { uri: `file://${path}`, writer: writable.getWriter() };
    return rid;
  }

  async read(rid: number): Promise<Uint8Array | null> {
    const { reader } = this.#resources[rid] || {};
    if (!reader)
      throw new Error("EBADF: Resource cannot be read");
    const read = await reader.read();
    return read.done ? null : read.value;
  }

  async write(rid: number, p: Uint8Array): Promise<void> {
    const { writer } = this.#resources[rid] || {};
    if (!writer)
      throw new Error("EBADF: Resource cannot be written");
    await writer.ready;
    await writer.write(p);
  }

  async close(rid: number): Promise<void> {
    const ressource = this.#resources[rid];
    if (!ressource)
      return; // resource already closed
    delete this.#resources[rid];
    await Promise.all([
      ressource.writer?.close().catch(() => null),
      ressource.reader?.cancel().catch(() => null)
    ]);
  }

  async spawn(entrypoint: string, {
    cwd = this.#cwd,
    arg0 = entrypoint,
    args = [],
    env = this.#env
  }: {
    cwd?: string,
    arg0?: string,
    args?: string[],
    env?: Record<string, string>,
  }) {
    return this.#kernel.spawn({
      entrypoint,
      cwd,
      argv: [arg0, ...args],
      env
    })
  }

  async exit(code: number | undefined) {
    code = Number(code);
    if (!isFinite(code))
      code = 0;
    await this[RELEASE_RESOURCES]();
    return this.#kernel.exit(code);
  }

  [RELEASE_RESOURCES]() {
    return Promise.all(Object
      .keys(this.#resources)
      .map(rid => this.close(Number(rid)))
    );
  }
}
Object.freeze(LocalProcess.prototype);

class LocalProcessController {
  constructor(
    channel: Channel
  ) {
    Object.freeze(this);
    LOCAL_PROCESS_CONTROLLER_ENDPOINT.expose(channel, this);
  }

  async spawn(
    channel: MessagePort,
    info: ProcessSpawnInfo,
    stdin: ReadableStream<Uint8Array>,
    stdout: WritableStream<Uint8Array>,
    stderr: WritableStream<Uint8Array>,
  ): Promise<void> {
    const kernel = KERNEL_PROCESS_ENDPOINT.attach(channel);
    channel.start();
    const resolved = new URL(info.entrypoint, 'file://' + info.cwd);
    const entrypointUrl = resolved.protocol === 'file:'
      ? await kernel.resolveUri(segments(resolved.pathname))
      : resolved.href;
    let initFunction: null | EntrypointFunction = null as any;
    self.webcontainer = (callback: EntrypointFunction) => (initFunction = callback);
    importScripts(entrypointUrl);
    // @ts-ignore
    delete self.webcontainer;
    if (typeof initFunction !== 'function')
      throw new Error(`Not an executable`);
    const init = initFunction;
    const process = new LocalProcess(
      kernel,
      info,
      stdin,
      stdout,
      stderr
    );
    Promise.resolve()
      .then(() => init(process))
      .finally(() => process[RELEASE_RESOURCES]())
      .then(code => process.exit(typeof code === 'number' && isFinite(code) ? code : 0))
      .catch(err => {
        console.error('[PID %s] %s: unhandled exception:', info.pid, info.entrypoint, err);
        return kernel.exit(127); // TODO: SIGSEGF
      });
  }
}
Object.freeze(LocalProcessController.prototype);

new LocalProcessController(self);
