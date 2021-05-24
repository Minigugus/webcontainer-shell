import type {KernelProcess} from "../kernel_space/process";
import {integer} from "../util/security";

export function exit(this: KernelProcess, code: number): never {
  integer(code);
  return this.exit(code) as never;
}

export async function kill(this: KernelProcess, pid: number) {
}
