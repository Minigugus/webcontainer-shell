import { boot } from './api/kernel'
import { HTTPVFS, NativeFileSystemVFS } from './api/vfs';

export * from './api/vfs';

export const kernel = boot();

await kernel.fs.mount('/', new NativeFileSystemVFS(await navigator.storage.getDirectory()));
await kernel.fs.mount('/bin', new HTTPVFS(new URL('./bin/', location.href).href));
