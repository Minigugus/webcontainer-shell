import type { FileSystemDriver, FileSystemNode } from './index';

export class EmptyFS implements FileSystemDriver {
  async resolveUri(path: string[]): Promise<string> {
    throw new Error(path.length ? 'ENOTFOUND' : 'EISDIR');
  }
  async access(path: string[]): Promise<boolean> {
    return !path.length;
  }
  async readDir(path: string[]): Promise<ReadableStream<FileSystemNode>> {
    if (path.length)
      throw new Error('ENOTFOUND');
    return new ReadableStream({
      start(c) {
        c.close();
      }
    });
  }
  async readFile(path: string[], offset?: number, length?: number): Promise<ReadableStream<Uint8Array>> {
    throw new Error(path.length ? 'ENOTFOUND' : 'EISDIR');
  }
  async writeFile(path: string[], offset: 'before' | 'after' | 'override', create: boolean): Promise<WritableStream<Uint8Array>> {
    throw new Error(path.length ? 'EACCESS' : 'EISDIR');
  }
  async deleteNode(path: string[], recursive: boolean): Promise<void> {
    throw new Error(path.length ? 'ENOTFOUND' : 'EBUSY');
  }
}
