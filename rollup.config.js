import { readdirSync, readFileSync, writeFileSync } from 'fs';
import typescript from 'rollup-plugin-typescript2';

const commands = Object.create(null);

export default [
  {
    input: {
      'kernel': 'src/kernelspace/index.ts'
    },
    output: {
      chunkFileNames: '[name].js',
      entryFileNames: '[name].js',
      format: 'esm',
      dir: 'public/lib'
    },
    plugins: [
      typescript()
    ]
  },
  {
    input: {
      'process': 'src/userspace/index.ts'
    },
    output: {
      exports: 'named',
      format: 'iife',
      dir: 'public/lib'
    },
    plugins: [
      typescript()
    ]
  },
  ...readdirSync(__dirname + '/src/command')
    .filter(name => name.endsWith('.ts'))
    .map(name =>
      [`${name.slice(0, -3)}`, `src/command/${name}`]
    )
    .map(([name, from]) => {
      /** @type {string} */
      const content = readFileSync(from, 'utf8');
      const [, description = '', usage = ''] = /\/\*\*((?:.|\n)+?)(?:@usage\s([^\n]+?)\s+)?\*\//.exec(content) ?? [];
      commands[name] = {
        usage: usage.split(' ').filter(x => x),
        description: description.replace(/^\s(?:\n|\*\s+)/gm, '').trim()
      };
      return ({
        input: {
          [name]: from
        },
        output: {
          exports: 'named',
          name: 'webcontainer',
          format: 'iife',
          dir: 'public/command'
        },
        plugins: [
          typescript()
        ]
      });
    })
];

writeFileSync(__dirname + '/public/command/help.json', JSON.stringify(commands));
