import type { FileSystemDriver, FileSystemNode } from './index';

import { asyncIterator2ReadableStream } from '../../utils';

type MemNode = MemFile | MemDirectory;

interface MemFile {
  type: 'file';
  content: Blob;
  url: string | null;
  lock: Promise<unknown>;
}

interface MemDirectory {
  type: 'directory';
  content: Record<string, MemNode>;
}

function expectedExists(node: MemNode | null): asserts node is MemNode {
  if (!node)
    throw new Error('ENOTFOUND');
}

function expectedDirectory(node: MemNode): asserts node is MemDirectory {
  if (node.type !== 'directory')
    throw new Error('ENOTADIR');
}

function expectedFile(node: MemNode): asserts node is MemFile {
  if (node.type !== 'file')
    throw new Error('EISDIR');
}

export class MemFS implements FileSystemDriver {
  #filetree: MemDirectory = { type: 'directory', content: Object.create(null) };

  async resolveUri(path: string[]): Promise<string> {
    let resolved: MemNode = this.#filetree;
    for (const segment of path) {
      expectedDirectory(resolved);
      const found: MemNode | null = resolved.content[segment] || null;
      expectedExists(found);
      resolved = found;
    }
    expectedFile(resolved);
    return resolved.url ??= URL.createObjectURL(resolved.content);
  }
  async access(path: string[]): Promise<boolean> {
    let resolved: MemNode = this.#filetree;
    for (const segment of path) {
      expectedDirectory(resolved);
      const found: MemNode | null = resolved.content[segment] || null;
      if (!found)
        return false;
      resolved = found;
    }
    return true;
  }
  async readDir(path: string[]): Promise<ReadableStream<FileSystemNode>> {
    let resolved: MemNode = this.#filetree;
    for (const segment of path) {
      const found: MemNode | null = resolved.content[segment] || null;
      expectedExists(found);
      expectedDirectory(found);
      resolved = found;
    }
    return asyncIterator2ReadableStream(
      Object
        .entries(resolved.content)
        .map(([name, { type }]) => ({
          type,
          name
        }))[Symbol.iterator]()
    )
  }
  async readFile(path: string[], offset = 0, length?: number): Promise<ReadableStream<Uint8Array>> {
    let resolved: MemNode = this.#filetree;
    for (const segment of path) {
      expectedDirectory(resolved);
      const found: MemNode | null = resolved.content[segment] || null;
      expectedExists(found);
      resolved = found;
    }
    expectedFile(resolved);
    const file = resolved;
    const result = resolved.lock
      .catch(() => (new Error().stack, null))
      .then(() => file.content.slice(offset, length ? offset + length : undefined).stream());
    resolved.lock = result;
    return result;
  }
  async writeFile(path: string[], offset: 'before' | 'after' | 'override', create: boolean): Promise<WritableStream<Uint8Array>> {
    let parent = this.#filetree, resolved: MemNode | null = parent;
    for (let i = 0; i < path.length; i++) {
      const segment = path[i]!;
      if (resolved)
        expectedDirectory(resolved);
      else if (create)
        resolved = parent.content[path[i - 1]!] = { type: 'directory', content: Object.create(null) };
      else
        expectedExists(resolved);
      const found: MemNode | null = resolved.content[segment] || null;
      parent = resolved;
      resolved = found;
    }
    if (resolved)
      expectedFile(resolved);
    else if (create)
      resolved = parent.content[path[path.length - 1]!] = {
        type: 'file',
        content: new Blob([]),
        url: null,
        lock: Promise.resolve()
      };
    else
      expectedExists(resolved);
    const strategy = new ByteLengthQueuingStrategy({ highWaterMark: 65535 });
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({}, strategy, strategy);
    const file = resolved;
    const result = Promise.all([
      resolved.lock.catch(() => null),
      new Response(readable).blob()
    ])
      .then(([, blob]) => {
        let content;
        switch (offset) {
          case 'override':
            content = blob;
            break;
          case 'before':
            content = new Blob([blob, file.content]);
            break;
          case 'after':
            content = new Blob([file.content, blob]);
            break;
        }
        if (file.url)
          URL.revokeObjectURL(file.url);
        file.url = null;
        file.content = content;
        new Error().stack;
      });
    resolved.lock = result;
    return Promise.resolve(writable);
  }
  async deleteNode(path: string[], recursive: boolean): Promise<void> {
    let parent = this.#filetree, resolved: MemNode | null = this.#filetree;
    for (const segment of path) {
      if (!resolved)
        resolved = parent.content[segment] = { type: 'directory', content: Object.create(null) };
      else
        expectedDirectory(resolved);
      const found: MemNode | null = resolved.content[segment] || null;
      parent = resolved;
      resolved = found;
    }
    if (resolved)
      if (parent === resolved)
        throw new Error('EBUSY'); // cannot delete root
      else
        delete parent.content[path[path.length - 1]!];
  }
}
