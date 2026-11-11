import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
await mkdir('dist', { recursive: true });
await build({entryPoints:['src/extension.ts'],bundle:true,platform:'node',format:'cjs',external:['vscode'],outfile:'dist/extension.js',sourcemap:true});
await build({entryPoints:['webview-ui/src/main.tsx'],bundle:true,platform:'browser',format:'iife',outfile:'dist/webview.js',minify:true});
const css = await postcss([tailwind()]).process(await readFile('webview-ui/src/styles.css','utf8'),{from:'webview-ui/src/styles.css',to:'dist/webview.css'});
await writeFile('dist/webview.css',css.css);
