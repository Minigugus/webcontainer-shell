export class KernelError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class FaultError extends KernelError {
  constructor(message: string) {
    super(message);
  }
}

export function integer(v: number): asserts v is number {
  if (!isFinite(v))
    throw new FaultError('Syscall encoding error');
}

export function string(v: string): asserts v is string {
  if (typeof (v as any) !== 'string')
    throw new FaultError('Syscall encoding error');
}

export function maybeInteger(v: number | undefined): asserts v is number | undefined {
  if (typeof v !== 'undefined' && !isFinite(v))
    throw new FaultError('Syscall encoding error');
}

export function maybeString(v: string | undefined): asserts v is string | undefined {
  if (typeof v !== 'undefined' && typeof (v as any) !== 'string')
    throw new FaultError('Syscall encoding error');
}

export function object(v: object): asserts v is object {
  if (typeof (v as any) !== 'object' || v === null)
    throw new FaultError('Syscall encoding error');
}

export function maybeObject(v: object | undefined): asserts v is object | undefined {
  if (typeof v !== 'undefined' && (typeof (v as any) !== 'object' || v === null))
    throw new FaultError('Syscall encoding error');
}

export function array(v: any[]): asserts v is any[] {
  if (!Array.isArray(v))
    throw new FaultError('Syscall encoding error');
}

export function maybeArray(v: any[]): asserts v is any[] {
  if (typeof v !== 'undefined' && !Array.isArray(v))
    throw new FaultError('Syscall encoding error');
}

export function funct(v: Function): asserts v is Function {
  if (typeof v !== 'function')
    throw new FaultError('Syscall encoding error');
}
