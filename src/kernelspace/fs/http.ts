import type { FileSystemDriver, FileSystemNode } from './index';

export class HTTPFS implements FileSystemDriver {
  #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  async resolveUri(path: string[]): Promise<string> {
    const url = new URL(path.join('/'), this.#root);
    url.hash = '';
    url.search = '';
    return url.href;
  }
  async access(path: string[]): Promise<boolean> {
    const url = new URL(path.join('/'), this.#root);
    url.hash = '';
    url.search = '';
    const response = await fetch(url.href, { method: 'HEAD', cache: 'force-cache' });
    switch (response.status) {
      case 200:
      case 201:
        return true;
      case 404:
      case 403:
        return false;
      default:
        throw new Error(`EHTTP ${response.status} ${response.statusText}`);
    }
  }
  async readDir(path: string[]): Promise<ReadableStream<FileSystemNode>> {
    throw new Error('EACCESS');
  }
  async readFile(path: string[], offset = 0, length?: number): Promise<ReadableStream<Uint8Array>> {
    if (path.length === 0)
      throw new Error('EISDIR');
    const url = new URL(path.join('/'), this.#root);
    url.hash = '';
    url.search = '';
    const response = await fetch(url.href, { cache: 'force-cache' });
    switch (response.status) {
      case 200:
        break;
      case 404:
        throw new Error('ENOTFOUND');
      case 403:
        throw new Error('EACCESS');
      default:
        throw new Error(`EHTTP ${response.status} ${response.statusText}`);
    }
    return response.body || new ReadableStream({
      start(c) {
        c.close();
      }
    });
  }
  async writeFile(path: string[], offset: 'before' | 'after' | 'override', create: boolean): Promise<WritableStream<Uint8Array>> {
    throw new Error('EACCESS');
  }
  async deleteNode(path: string[], recursive: boolean): Promise<void> {
    throw new Error('EACCESS');
  }
}
