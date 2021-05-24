import {KernelProcess} from "../kernel_space/process";

export * from './process';

type SyscallHandlers = typeof import('.');

export type SyscallAPI = {
  [syscall in keyof SyscallHandlers]:
  SyscallHandlers[syscall] extends (this: KernelProcess, ...args: infer R) => infer S
    ? ((...args: R) => (S extends PromiseLike<infer T> ? Promise<T> : Promise<S>))
    : SyscallHandlers[syscall];
}

interface SyscallMessageBase<K extends string, T extends any[]> {
  syscall: K;
  args: T;
  reply?: MessagePort;
}

export type SyscallMessage = {
  [syscall in keyof SyscallAPI]: SyscallAPI[syscall] extends (...args: infer R) => any
    ? SyscallMessageBase<syscall, R>
    : never;
}[keyof SyscallAPI];

// {
//   [syscall in keyof SyscallAPI]: SyscallAPI[syscall] extends (...args: infer R) => infer S
//     ? ((call: { syscall: syscall, args: R }) => (S extends PromiseLike<infer T> ? Promise<T> : Promise<S>))
//     : never;
// }[keyof SyscallAPI];
