import {BootstrapMessage} from '../kernel_space/process';
import {SyscallAPI} from "../syscall";

type SyscallBindingRun<U extends keyof SyscallAPI = keyof SyscallAPI> = <T extends U>(
  call: { syscall: T, args: Parameters<SyscallAPI[T]> },
  transfert?: (Transferable | ReadableStream<Uint8Array> | WritableStream<Uint8Array>)[]
) => void;

type SyscallBindingQuery<U extends keyof SyscallAPI = keyof SyscallAPI> = <T extends U>(
  call: { syscall: T, args: Parameters<SyscallAPI[T]> },
  transfert?: (Transferable | ReadableStream<Uint8Array> | WritableStream<Uint8Array>)[]
) => (ReturnType<SyscallAPI[T]> extends PromiseLike<infer T> ? Promise<T> : Promise<ReturnType<SyscallAPI[T]>>);

interface SyscallConnection {
  run: SyscallBindingRun;
  query: SyscallBindingQuery;
}

const MessageChannel = globalThis.MessageChannel;
const Promise = globalThis.Promise;

const createSyscallWrapper: (port: MessagePort) => SyscallConnection = port => {
  return ({
    run: (content, transfert) => port.postMessage(content, transfert as any),
    query: (content, transfert) => {
      const {port1, port2} = new MessageChannel();
      // @ts-ignore
      content.reply = port1;
      port.postMessage(content, transfert as any);
      return new Promise<void>((res, rej) => {
        port2.onmessage = ({data}) => data ? data.resolve
          ? res(data.resolve)
          : rej(data.reject)
          : res();
      }).finally(() => port2.close()) as any;
    }
  })
};

export class LocalProcess implements SyscallAPI {
  readonly #ppid: number;
  readonly #pid: number;
  readonly #uid: number;
  readonly #gid: number;
  #cwd: string;
  readonly #env: Record<string, string>;
  readonly #argv: [string, ...string[]];

  readonly #syscall: SyscallConnection;
  readonly #stdin: ReadableStream<Uint8Array>;
  readonly #stdout: WritableStream<Uint8Array>;
  readonly #stderr: WritableStream<Uint8Array>;

  constructor(
    init: BootstrapMessage
  ) {
    const {
      ppid, pid, uid, gid, cwd, env,
      argv, stdin, stdout, stderr,

      syscall,
    } = init;
    this.#ppid = ppid;
    this.#pid = pid;
    this.#uid = uid;
    this.#gid = gid;
    this.#cwd = cwd;
    this.#env = env;
    this.#argv = argv;
    this.#stdin = stdin;
    this.#stdout = stdout;
    this.#stderr = stderr;
    this.#syscall = createSyscallWrapper(syscall);
  }

  get ppid() {
    return this.#ppid;
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

  get cwd() {
    return this.#cwd;
  }

  set cwd(value) {
    this.#cwd = value;
  }

  get env() {
    return this.#env;
  }

  get argv() {
    return this.#argv;
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

  exit(code = 0) {
    this.#syscall.run({
      syscall: 'exit',
      args: [code]
    });
    return null!;
  }

  kill(signal: number) {
    return this.#syscall.query({
      syscall: 'kill',
      args: [signal]
    });
  }
}

Object.freeze(LocalProcess.prototype);
