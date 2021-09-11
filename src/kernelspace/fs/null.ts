import type { FileSystemDriver, FileSystemNode } from './index';

export class NullFS implements FileSystemDriver {
  async resolveUri(path: string[]): Promise<string> {
    throw new Error('EACCESS');
  }
  async access(path: string[]): Promise<boolean> {
    return false;
  }
  async readDir(path: string[]): Promise<ReadableStream<FileSystemNode>> {
    throw new Error('EACCESS');
  }
  async readFile(path: string[], offset?: number, length?: number): Promise<ReadableStream<Uint8Array>> {
    throw new Error('EACCESS');
  }
  async writeFile(path: string[], offset: 'before' | 'after' | 'override', create: boolean): Promise<WritableStream<Uint8Array>> {
    throw new Error('EACCESS');
  }
  async deleteNode(path: string[], recursive: boolean): Promise<void> {
    throw new Error('EACCESS');
  }
}
