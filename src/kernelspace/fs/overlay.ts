import type { FileSystemDriver, FileSystemNode } from './index';

interface OverlayNode {
  driver: FileSystemDriver | null;
  children: Record<string, OverlayNode>;
}

function prependToStream<T>(items: T[], stream: ReadableStream<T>) {
  return stream.pipeThrough(new TransformStream({
    start(c) {
      items.forEach(i => c.enqueue(i));
    }
  }));
}

export class OverlayFS implements FileSystemDriver {
  #mount: OverlayNode = { driver: null, children: Object.create(null) };

  mount(path: string[], fs: FileSystemDriver) {
    let node = this.#mount;
    for (const segment of path)
      node = node.children[segment] ??= { driver: null, children: Object.create(null) };
    if (node.driver !== null)
      throw new Error('A mount point is already exists at /' + path.join('/'));
    node.driver = fs;
    return this;
  }

  resolve(path: string[]): { driver: FileSystemDriver, node: OverlayNode | null } {
    let node: OverlayNode | null = this.#mount, found = this.#mount.driver && this.#mount, founddepth = 0, depth = 0;
    for (const segment of path) {
      node = node!.children[segment] ?? null;
      if (!node) {
        node = null;
        break;
      }
      depth++;
      if (node.driver) {
        founddepth = depth;
        found = node;
      }
    }
    if (found === null)
      throw new Error('ENOTFOUND');
    path.splice(0, founddepth);
    return found && { driver: found.driver!, node };
  }

  resolveUri(path: string[]): Promise<string> {
    return this.resolve(path).driver!.resolveUri(path);
  }
  access(path: string[]): Promise<boolean> {
    return this.resolve(path).driver!.access(path);
  }
  async readDir(path: string[]): Promise<ReadableStream<FileSystemNode>> {
    const fs = this.resolve(path);
    const stream = await fs.driver!.readDir(path);
    if (!fs.node)
      return stream;
    const mounts = Object.keys(fs.node.children).map(name => ({ type: 'directory', name }))
    return prependToStream(mounts, stream);
  }
  readFile(path: string[], offset?: number, length?: number): Promise<ReadableStream<Uint8Array>> {
    return this.resolve(path).driver!.readFile(path, offset, length);
  }
  writeFile(path: string[], offset: 'before' | 'after' | 'override', create: boolean): Promise<WritableStream<Uint8Array>> {
    return this.resolve(path).driver!.writeFile(path, offset, create);
  }
  deleteNode(path: string[], recursive: boolean): Promise<void> {
    return this.resolve(path).driver!.deleteNode(path, recursive);
  }
}
