declare const enum ChooseFileSystemEntriesType {
  'open-file',
  'save-file',
  'open-directory'
}

interface ChooseFileSystemEntriesOptionsAccepts {
  description?: string;
  mimeTypes?: string;
  extensions?: string;
}

interface ChooseFileSystemEntriesOptions {
  type?: ChooseFileSystemEntriesType;
  multiple?: boolean;
  accepts?: ChooseFileSystemEntriesOptionsAccepts[];
  excludeAcceptAllOption?: boolean;
}

interface FileSystemHandlePermissionDescriptor {
  mode: 'read' | 'readwrite';
}

interface FileSystemCreateWriterOptions {
  keepExistingData?: boolean;
}

interface FileSystemGetFileOptions {
  create?: boolean;
}

interface FileSystemGetDirectoryOptions {
  create?: boolean;
}

interface FileSystemRemoveOptions {
  recursive?: boolean;
}

declare const enum SystemDirectoryType {
  'sandbox'
}

interface GetSystemDirectoryOptions {
  type: SystemDirectoryType;
}

interface FileSystemHandle {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly name: string;

  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;

  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface FileSystemHandleConstructor {
  new(): FileSystemHandle;
}

declare const enum WriteCommandType {
  write = 0,
  seek = 1,
  truncate = 2,
}

type WriteParams = {
  type: WriteCommandType.write;
  data: BufferSource | Blob | string;
} | {
  type: WriteCommandType.seek;
  position: number;
} | {
  type: WriteCommandType.truncate;
  size: number;
};

type FileSystemWriteChunkType = BufferSource | Blob | string | WriteParams;

interface FileSystemWritableFileStream extends WritableStream {
  write(data: FileSystemWriteChunkType): Promise<void>;

  seek(position: number): Promise<void>;

  truncate(size: number): Promise<void>;

  close(): Promise<void>;
}

interface FileSystemWritableFileStreamConstructor {
  new(): FileSystemWritableFileStream;
}

interface FileSystemFileHandle extends FileSystemHandle {
  readonly kind: 'file';

  getFile(): Promise<File>;

  createWritable(options?: FileSystemCreateWriterOptions): Promise<FileSystemWritableFileStream>;
}

interface FileSystemFileHandleConstructor {
  new(): FileSystemFileHandle;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind: 'directory';

  getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<FileSystemFileHandle>;

  getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions): Promise<FileSystemDirectoryHandle>;

  removeEntry(name: string, options?: FileSystemRemoveOptions): Promise<void>;

  keys(): AsyncIterable<string>;

  values(): AsyncIterable<FileSystemFileHandle | FileSystemDirectoryHandle>;

  entries(): AsyncIterable<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
}

interface FileSystemDirectoryHandleConstructor {
  new(): FileSystemDirectoryHandle;

  getSystemDirectory(options: GetSystemDirectoryOptions): Promise<FileSystemDirectoryHandle>;
}

interface WorkerGlobalScope {
  FileSystemHandle: FileSystemHandleConstructor;
  FileSystemFileHandle: FileSystemFileHandleConstructor;
  FileSystemDirectoryHandle: FileSystemDirectoryHandleConstructor;
  FileSystemWritableFileStream: FileSystemWritableFileStreamConstructor;
}

interface StorageManager {
  getDirectory(): Promise<FileSystemDirectoryHandle>;
}

