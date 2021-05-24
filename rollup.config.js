import typescript from 'rollup-plugin-typescript2';

export default [
  // {
  //   input: {
  //     'kernel': 'src/kernel_space/index.ts',
  //     'process': 'src/user_space/index.ts'
  //   },
  //   output: {
  //     chunkFileNames: '[name].mjs',
  //     entryFileNames: '[name].mjs',
  //     format: 'esm',
  //     dir: 'dist/v2'
  //   },
  //   plugins: [
  //     typescript()
  //   ]
  // },
  {
    input: {
      'index': 'src/index.ts',
      'process_worker': 'src/process_worker/index.ts'
    },
    output: {
      chunkFileNames: '[name].mjs',
      entryFileNames: '[name].mjs',
      format: 'esm',
      dir: 'public/dist'
    },
    plugins: [
      typescript()
    ]
  }
];
