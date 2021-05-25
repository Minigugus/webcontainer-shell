# [WIP] WebContainer Shell

> WebContainer inspired shell, in the browser

*This is a proof-of-concept and work in progress - code is messy and serve demonstration purpose only*

Checkout the demo at https://webcontainer-shell.vercel.app/

This projects aims to contribute to the discussion about [WebContainer specification](https://github.com/stackblitz/webcontainer-core).

This bash-like shell except it runs in the browser, and it comes with a lightweight kernel implementation (supports process and filesystem management):
 * Every process runs in its own dedicated worker
 * Extensible filesystem (use the Native File System by default)
 * Performant (heavily rely on the Streams API and their transfer through postMessage)
 * Supports commands pipes (eg. `echo Hello world! | tee README`)

Interesting files:
 * [`src/process_worker/index.ts`](src/process_worker/index.ts): Process runtime (wrapper around the syscall API)
 * [`src/api/process_worker.ts`](src/api/process_worker.ts): Kernel-side process representation (handle syscalls from workers)
 * [`src/api/vfs.ts`](src/api/vfs.ts): Extensible virtual filesystem implementation

## TODO

 * [ ] Serve filesystem via Service Worker
 * [ ] Let the app works offline with a Service Worker
 * [ ] Move shell features into a dedicated a process (enable nested shells)
 * [ ] Add jobs support (in order to detached commands)
 * [ ] Add network support (TCP, UNIX socket, UDP)
 * [ ] Add multi-tabs support (cross-tabs kernel)
 * [ ] Add `ps` and `kill` commands
 * [ ] Add docs about APIs and kernel design
 * [ ] Add a `deno` command (redirect ops to the in-browser kernel)
 * [ ] `iframe`-based process ? (enable `electron`-like apps)
