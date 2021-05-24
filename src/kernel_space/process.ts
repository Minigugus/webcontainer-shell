import {Kernel} from "./kernel";
import {deferrable} from "../util/deferrable";
import {
  array,
  FaultError,
  funct,
  integer,
  KernelError,
  maybeInteger,
  maybeObject,
  maybeString,
  object,
  string
} from "../util/security";
import * as syscalls from "../syscall";
import {SyscallMessage} from "../syscall";
import {SIGKILL, Signal} from "./signals";

/**
 * Shared between kernel and user spaces
 */
export interface ProcessInfo {
  readonly ppid: number;
  readonly pid: number;
  readonly uid: number;
  readonly gid: number;
  readonly argv: [string, ...string[]];
}

export interface ExecOptions {
  readonly uid?: number;
  readonly gid?: number;
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly argv: [string, ...string[]];
}

export interface BootstrapMessage extends Required<ExecOptions> {
  readonly ppid: number;
  readonly pid: number;

  // Fields filtered by the bootstrap code
  readonly syscall: MessagePort;
  readonly stdin: ReadableStream<Uint8Array>;
  readonly stdout: WritableStream<Uint8Array>;
  readonly stderr: WritableStream<Uint8Array>;
}

export interface BootstrapMessageWithEntrypoint extends BootstrapMessage {
  readonly entrypoint: string;
}

type ReplyMessage<T, E> = never
  | { resolve: T }
  | { reject: E };

export async function dispatch(this: KernelProcess, e: MessageEvent) {
  const {data}: { data: SyscallMessage } = e;
  let reply: ReplyMessage<any, any> = null!;
  try {
    object(data);
    string(data.syscall);
    array(data.args);
    const syscall = syscalls[data.syscall];
    funct(syscall);
    const resolve = await syscall.apply<KernelProcess, any, ReturnType<typeof syscall>>(this, data.args);
    if (typeof resolve !== 'undefined')
      reply = {resolve};
  } catch (err) {
    if (!(err instanceof KernelError)) {
      this.kernel.panic(this, data, err);
      err = new FaultError(`PANIC: ${err?.message ?? err}`);
    }
    if (err instanceof FaultError) // SEGFAULT
      await this.kill(SIGKILL);
    reply = {reject: err};
  } finally {
    const {reply: send} = data;
    if (send) {
      send.postMessage(reply);
      send.close();
    }
  }
}

const strategy = new ByteLengthQueuingStrategy({
  highWaterMark: 65535
});

export class KernelProcess implements ProcessInfo {
  public asWorker(
    kernel: Kernel,
    parent: KernelProcess | null,
    pid: number,
    uid: number,
    gid: number,
    cwd: string,
    env: Record<string, string>,
    argv: [string, ...string[]],
    entrypoint: string,
  ) {
    const worker = new Worker(kernel.processWrapperUrl, {
      credentials: 'omit',
      name: this.name,
      type: 'module'
    });
  }

  #ready = deferrable<void>();
  #status = deferrable<number>();
  #children = new Set<KernelProcess>();
  #stdin = new TransformStream<Uint8Array, Uint8Array>({}, strategy, strategy);
  #stdout = new TransformStream<Uint8Array, Uint8Array>({}, strategy, strategy);
  #stderr = new TransformStream<Uint8Array, Uint8Array>({}, strategy, strategy);

  public readonly name: string;

  constructor(
    protected readonly kernel: Kernel,
    public readonly parent: KernelProcess | null,
    public readonly pid: number,
    public readonly uid: number,
    public readonly gid: number,
    cwd: string,
    env: Record<string, string>,
    public readonly argv: [string, ...string[]],
    attach: (process: KernelProcess, bootstrap: BootstrapMessage) => void
  ) {
    this.name = `[PID ${pid}] ${argv[0]}`;
    this.#status.promise = this.#status.promise
      .finally(() => Promise.all([...this.#children].map(c => c.kill(SIGKILL))));

    const {port1, port2} = new MessageChannel();
    port2.addEventListener('message', e => {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.#ready.resolve();
    }, {
      once: true,
      capture: true
    })
    port2.onmessage = dispatch.bind(this);

    const bootstrapMsg: BootstrapMessage = {
      ppid: parent?.pid ?? 0,
      pid,
      uid,
      gid,
      cwd,
      env,
      argv,

      syscall: port1,
      stdin: this.#stdin.readable,
      stdout: this.#stdout.writable,
      stderr: this.#stderr.writable
    };

    attach(this, bootstrapMsg);
  }

  get ready() {
    return this.#ready.promise;
  }

  get status() {
    return this.#status.promise;
  }

  get ppid() {
    return this.parent?.pid ?? 0;
  }

  get children() {
    return this.#children.values();
  }

  exit(code = 0) {
    integer(code);
    this.#status.resolve(code);
    return this.#status.promise;
  }

  kill(signal: Signal) {
    integer(signal);
    return this.exit(128 + signal); // FIXME Improve
  }

  clone(entrypoint: string, options: ExecOptions) {
    string(entrypoint);
    object(options);
    maybeInteger(options.uid);
    maybeInteger(options.gid);
    maybeString(options.cwd);
    maybeObject(options.env);
    array(options.argv);
    const child = this.kernel.spawn(this, entrypoint, options);
    child.status.finally(() => this.#children.delete(child));
    this.#children.add(child);
    return child;
  }
}
