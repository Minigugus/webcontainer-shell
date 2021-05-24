/// <reference path="./native-fs.d.ts" />

export interface VFS {
  url(path: string): PromiseLike<string | null>;

  read(path: string, offset: number, size: number): PromiseLike<ReadableStream<Uint8Array> | null>;

  readdir(path: string): PromiseLike<ReadableStream<{ kind: 'file' | 'directory', name: string }> | null>;

  write(path: string, offset: number, size: number): PromiseLike<WritableStream<Uint8Array> | null>;

  mkdir(path: string): PromiseLike<void>;

  delete(path: string): PromiseLike<void>;
}

export class MountableVFS implements VFS {
  readonly #mount = new Map<string, VFS>();

  async mount(path: string, fs: VFS) {
    path = new URL(path, 'file:///').pathname.replace(/\/+$/, '');
    if (this.#mount.has(path))
      throw new Error(path + ': Path already mounted');
    await this.mkdir(path);
    this.#mount.set(path, fs);
  }

  private resolve(path: string): [VFS, string] | null {
    path = new URL(path, 'file:///').pathname.replace(/\/+$/, '');
    let mount = path;
    let found: VFS | undefined;
    while (mount && !(found = this.#mount.get(mount)))
      mount = mount.replace(/\/[^/]+$/, '');
    if (!found) {
      const root = this.#mount.get('');
      if (!root)
        return null;
      return [root, path || '/'];
    }
    return [found, path.slice(mount.length) || '/'];
  }

  read(path: string, offset: number, size: number): PromiseLike<ReadableStream<Uint8Array> | null> {
    const resolved = this.resolve(path);
    return Promise.resolve(resolved && resolved[0].read(resolved[1], offset, size));
  }

  readdir(path: string): PromiseLike<ReadableStream<{ kind: 'file' | 'directory', name: string }> | null> {
    const resolved = this.resolve(path);
    return Promise.resolve(resolved && resolved[0].readdir(resolved[1]));
  }

  write(path: string, offset: number, size: number): PromiseLike<WritableStream<Uint8Array> | null> {
    const resolved = this.resolve(path);
    return Promise.resolve(resolved && resolved[0].write(resolved[1], offset, size));
  }

  delete(path: string): PromiseLike<void> {
    const resolved = this.resolve(path);
    return Promise.resolve(resolved?.[0].delete(resolved[1]));
  }

  mkdir(path: string): PromiseLike<void> {
    const resolved = this.resolve(path);
    return Promise.resolve(resolved?.[0].mkdir(resolved[1]));
  }

  url(path: string): PromiseLike<string | null> {
    const resolved = this.resolve(path);
    return Promise.resolve(resolved && resolved[0].url(resolved[1]));
  }
}

export class NativeFileSystemVFS implements VFS {
  readonly #root: FileSystemDirectoryHandle;

  constructor(root: FileSystemDirectoryHandle) {
    this.#root = root;
  }

  private async resolve(path: string, mode: 'read' | 'readwrite' = 'read') {
    let segment: string, current = this.#root;
    await current.requestPermission({mode: 'read'});
    while (([, segment, path] = /^\/([^/]+)(\/.+)$/.exec(path) ?? [null, '', path])[0]) {
      current = await current.getDirectoryHandle(segment, {create: mode !== 'read'});
    }
    return [current, path.replace(/^\//, '')] as const;
  }

  async read(path: string, offset: number, size: number): Promise<ReadableStream<Uint8Array> | null> {
    path = new URL(path, 'file:///').pathname.replace(/\/+$/, '');
    const [parent, basename] = await this.resolve(path);
    const entry = await parent.getFileHandle(basename, {create: false});
    await entry.requestPermission({mode: 'read'});
    let file: Blob = await entry.getFile();
    file = file.slice(offset, isFinite(size) ? (offset + size) : file.size);
    return file.stream();
  }

  async readdir(path: string): Promise<ReadableStream<{ kind: 'file' | 'directory', name: string }> | null> {
    path = new URL(path, 'file:///').pathname.replace(/\/+$/, '');
    let [entry, basename] = await this.resolve(path);
    if (basename) {
      entry = await entry.getDirectoryHandle(basename, {create: false});
      await entry.requestPermission({mode: 'read'});
    }
    let iterator = entry.values()[Symbol.asyncIterator]();
    return new ReadableStream<{ kind: "file" | "directory"; name: string }>({
      async pull(controller: ReadableStreamController<{ kind: "file" | "directory"; name: string }>): Promise<void> {
        try {
          while (controller.desiredSize === null || controller.desiredSize > 0) {
            const result = await iterator.next();
            if (result.done)
              return controller.close();
            controller.enqueue({
              kind: result.value.kind,
              name: result.value.name
            });
          }
        } catch (err) {
          controller.error(err);
        }
      }
    });
  }

  async write(path: string, offset: number, size: number): Promise<WritableStream<Uint8Array> | null> {
    path = new URL(path, 'file:///').pathname.replace(/\/+$/, '');
    const [parent, basename] = await this.resolve(path, 'readwrite');
    const entry = await parent.getFileHandle(basename, {create: true});
    await entry.requestPermission({mode: 'readwrite'});
    const writable = await entry.createWritable();
    if (offset)
      await writable.seek(offset);
    return writable;
  }

  async mkdir(path: string): Promise<void> {
    path = new URL(path, 'file:///').pathname.replace(/\/+$/, '');
    const [parent, basename] = await this.resolve(path, 'readwrite');
    if (basename)
      await parent.getDirectoryHandle(basename, {create: true});
  }

  async delete(path: string): Promise<void> {
    path = new URL(path, 'file:///').pathname.replace(/\/+$/, '');
    const [parent, basename] = await this.resolve(path);
    await parent.requestPermission({mode: 'readwrite'});
    await parent.removeEntry(basename, {recursive: false});
  }

  async url(path: string): Promise<string | null> {
    path = new URL(path, 'file:///').pathname.replace(/\/+$/, '');
    try {
      const [parent, basename] = await this.resolve(path);
      const entry = await parent.getFileHandle(basename, {create: false});
      await entry.requestPermission({mode: 'read'});
      return URL.createObjectURL(await new Response((await entry.getFile()).stream(), {
        headers: {
          'Content-Type': 'application/javascript'
        }
      }).blob());
    } catch (err) {
      // if (err instanceof Error && err.name === 'NotFoundError')
      //   return null;
      throw err;
    }
  }
}

export class HTTPVFS implements VFS {
  readonly #baseUrl: string;

  constructor(baseUrl: string) {
    this.#baseUrl = baseUrl;
  }

  private getUrl(path: string) {
    return new URL('.' + new URL(path, 'file:///').pathname.replace(/\/+$/, ''), this.#baseUrl).href;
  }

  async read(path: string, offset: number, size: number): Promise<ReadableStream<Uint8Array> | null> {
    const response = await fetch(this.getUrl(path), {
      method: 'GET',
      headers: !offset ? {} : {
        'Range': `${offset}-${isFinite(size) ? (offset + size) : ''}`
      }
    });
    if (!response.ok)
      throw new Error(`${response.status}: ${response.statusText}`);
    return response.body;
  }

  async readdir(path: string): Promise<ReadableStream<{ kind: "file" | "directory"; name: string }> | null> {
    console.debug(path);
    if (path !== '/')
      return null;
    const response = await fetch(this.getUrl('/cmds.json'));
    const cmds: Record<string, { shadow?: true }> = await response.json();
    return new ReadableStream({
      pull(controller: ReadableStreamDefaultController<{ kind: "file" | "directory"; name: string }>) {
        for (let [name, {shadow}] of Object.entries(cmds)) {
          if (shadow)
            continue;
          controller.enqueue({
            kind: 'file',
            name: `${name}.js`
          });
        }
        controller.close();
      }
    });
  }

  async write(path: string, offset: number, size: number): Promise<WritableStream<Uint8Array> | null> {
    const {readable, writable} = new TransformStream<Uint8Array, Uint8Array>({
      async flush() {
        await promise;
      }
    });
    const promise = fetch(this.getUrl(path), {
      method: 'PUT',
      body: readable,
      headers: !offset ? {} : {
        'Range': `${offset}-${isFinite(size) ? (offset + size) : ''}`
      }
    });
    return writable;
  }

  async mkdir(path: string): Promise<void> {
    throw new Error('Operation not supported');
  }

  async delete(path: string): Promise<void> {
    await fetch(this.getUrl(path), {
      method: 'DELETE'
    });
  }

  async url(path: string): Promise<string | null> {
    return this.getUrl(path);
  }
}
