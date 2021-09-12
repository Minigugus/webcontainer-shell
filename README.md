# [WIP] WebContainer Shell

> Your viewing the v2 branch, a complete rewrite more future-proof

> WebContainer-inspired shell, in the browser

*This is a proof-of-concept and work in progress - code is messy and serve demonstration purpose only*

Checkout the demo at https://bash-js.vercel.app

This projects aims to contribute to the discussion about [WebContainer specification](https://github.com/stackblitz/webcontainer-core).

This is a bash-like shell but that runs in the browser. It comes with a lightweight kernel implementation (supports process and filesystem management):
 * Every process runs in its own dedicated worker
 * [Extensible filesystem](public/index.js#L56-L62)
 * Performant (heavily rely on postMessage and Transferable objects - reduce minimize the amount of copy)
 * Supports commands pipes (eg. `echo Hello world! | tee README`)

Interesting files:
 * [`public/index.js`](public/index.js): Example of how to use the proposed Webcontainer API
 * [`src/kernelspace/fs/`](src/kernelspace/fs/): Supported filesystems implementation
 * [`src/command/`](src/command/): Commands implementations

## TODO

 * [ ] Serve filesystem via Service Worker
 * [ ] Let the app works offline with a Service Worker
 * [X] Move shell features into a dedicated a process (enable nested shells)
 * [ ] Add signals support (for SIGINT and SIGKILL)
 * [ ] Add jobs support (enables detached commands)
 * [ ] Add network support (TCP, UNIX socket, UDP)
 * [ ] Add multi-tabs support (one container per tab)
 * [ ] Add a [WASI](https://wasi.dev) runtime (a `wasi [wasm-file]` command for instance)
   * [ ] Add integration with [WAPM](https://wapm.io/interface/wasi)
 * [ ] Add `ps` and `kill` commands
 * [ ] Add docs about APIs and kernel design
 * [ ] Add a `deno` command (shim the Rust part with a wrapper around this lib's API)
 * [ ] `iframe`-based process ? (enable `electron`-like apps)
