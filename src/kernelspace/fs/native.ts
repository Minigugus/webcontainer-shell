/// <reference path="./native.d.ts" />

import { asyncIterator2ReadableStream } from '../../utils';
import type { FileSystemDriver, FileSystemNode } from './index';

const processError = (expectDirectory: boolean, err: any) => {
  if (err instanceof Error && typeof (err.name as any) === 'string')
    switch (err.name) {
      case 'NotFoundError':
        return 'ENOTFOUND';
      case 'TypeMismatchError':
        return expectDirectory
          ? 'ENOTADIR'
          : 'EISDIR';
      case 'InvalidModificationError':
        return 'ENOTEMPTY';
      case 'SecurityError':
      case 'TypeError':
      case 'NotAllowedError':
        return 'EACCESS';
    }
  throw err;
}

export class NativeFS implements FileSystemDriver {
  #root: FileSystemDirectoryHandle;

  constructor(root: FileSystemDirectoryHandle) {
    this.#root = root;
  }

  async resolveUri(path: string[]): Promise<string> {
    const file = path.pop();
    if (!file)
      throw new Error('EISDIR');
    let parent = this.#root;
    try {
      for (const segment of path)
        parent = await parent.getDirectoryHandle(segment, { create: false });
    } catch (err) {
      throw new Error(processError(true, err));
    }
    try {
      const found = await parent.getFileHandle(file, { create: false });
      return URL.createObjectURL(await found.getFile());
    } catch (err) {
      throw new Error(processError(false, err));
    }
  }
  async access(path: string[]): Promise<boolean> {
    const file = path.pop();
    if (!file)
      throw new Error('EISDIR');
    let parent = this.#root;
    try {
      for (const segment of path)
        parent = await parent.getDirectoryHandle(segment, { create: false });
    } catch (err) {
      const msg = processError(true, err);
      if (msg === 'ENOTFOUND')
        return false;
      throw new Error(msg);
    }
    try {
      const found = await parent.getFileHandle(file, { create: false });
      return (await found.queryPermission({ mode: 'read' })) === 'granted';
    } catch (err) {
      const msg = processError(false, err);
      if (msg === 'ENOTFOUND')
        return false;
      throw new Error(msg);
    }
  }
  async readDir(path: string[]): Promise<ReadableStream<FileSystemNode>> {
    let parent = this.#root;
    try {
      for (const segment of path)
        parent = await parent.getDirectoryHandle(segment, { create: false });
    } catch (err) {
      throw new Error(processError(true, err));
    }
    try {
      return asyncIterator2ReadableStream(parent.entries()[Symbol.asyncIterator](), ([name, entry]) => ({
        type: entry.kind,
        name
      }));
    } catch (err) {
      throw new Error(processError(false, err));
    }
  }
  async readFile(path: string[], offset?: number, length?: number): Promise<ReadableStream<Uint8Array>> {
    const file = path.pop();
    if (!file)
      throw new Error('EISDIR');
    let parent = this.#root;
    try {
      for (const segment of path)
        parent = await parent.getDirectoryHandle(segment, { create: false });
    } catch (err) {
      throw new Error(processError(true, err));
    }
    try {
      const found = await parent.getFileHandle(file, { create: false });
      return (await found.getFile()).stream();
    } catch (err) {
      throw new Error(processError(false, err));
    }
  }
  async writeFile(path: string[], offset: 'before' | 'after' | 'override', create: boolean): Promise<WritableStream<Uint8Array>> {
    const file = path.pop();
    if (!file)
      throw new Error('EISDIR');
    let parent = this.#root;
    try {
      for (const segment of path)
        parent = await parent.getDirectoryHandle(segment, { create });
    } catch (err) {
      throw new Error(processError(true, err));
    }
    try {
      const found = await parent.getFileHandle(file, { create });
      const buffer = new TransformStream<Uint8Array, Uint8Array>({});
      buffer.readable
        .pipeTo(await found.createWritable({ keepExistingData: offset !== 'override' }))
        .catch(() => null);
      return buffer.writable;
    } catch (err) {
      throw new Error(processError(false, err));
    }
  }
  async deleteNode(path: string[], recursive: boolean): Promise<void> {
    const file = path.pop();
    if (!file)
      throw new Error('EBUSY');
    let parent = this.#root;
    try {
      for (const segment of path)
        parent = await parent.getDirectoryHandle(segment, { create: false });
    } catch (err) {
      const msg = processError(true, err);
      if (msg === 'ENOTFOUND')
        return;
      throw new Error(msg);
    }
    try {
      await parent.removeEntry(file, { recursive });
    } catch (err) {
      const msg = processError(false, err);
      if (msg === 'ENOTFOUND')
        return;
      throw new Error(msg);
    }
  }
}
