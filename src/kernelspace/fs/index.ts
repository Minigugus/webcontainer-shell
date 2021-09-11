export type FileSystemNode = FileSystemFile | FileSystemDirectory;
export interface FileSystemFile {
  type: 'file',
  name: string;
}
export interface FileSystemDirectory {
  type: 'directory',
  name: string;
}

export interface FileSystemDriver {
  resolveUri(path: string[]): Promise<string>;
  access(path: string[]): Promise<boolean>;
  readDir(path: string[]): Promise<ReadableStream<FileSystemNode>>;
  readFile(path: string[], offset?: number, length?: number): Promise<ReadableStream<Uint8Array>>;
  writeFile(path: string[], offset: 'before' | 'after' | 'override', create: boolean): Promise<WritableStream<Uint8Array>>;
  deleteNode(path: string[], recursive: boolean): Promise<void>;
}
