import { build } from 'esbuild';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const manifest=JSON.parse(await readFile('package.json','utf8'));
const hash=createHash('sha256');hash.update(JSON.stringify(manifest));
for(const config of ['build.mjs','package-lock.json','tsconfig.json','webview-ui/tsconfig.json']) hash.update(await readFile(config));
async function hashSources(directory) {
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const file=directory+'/'+entry.name;
    if(entry.isDirectory()) await hashSources(file);
    else if(/\.(ts|tsx|css)$/.test(entry.name)) {hash.update(file);hash.update(await readFile(file));}
  }
}
await hashSources('src');await hashSources('webview-ui/src');
export const stamp={version:manifest.version,build:hash.digest('hex').slice(0,12)};
await mkdir('dist', { recursive: true });
await build({entryPoints:['src/extension.ts'],bundle:true,platform:'node',format:'cjs',external:['vscode'],define:{__DEVPILOT_BUILD__:JSON.stringify(stamp)},outfile:'dist/extension.js',sourcemap:true});
await build({entryPoints:['webview-ui/src/main.tsx'],bundle:true,platform:'browser',format:'iife',outfile:'dist/webview.js',minify:true});
const css = await postcss([tailwind()]).process(await readFile('webview-ui/src/styles.css','utf8'),{from:'webview-ui/src/styles.css',to:'dist/webview.css'});
await writeFile('dist/webview.css',css.css);

console.log(`DevPilot build ${stamp.version} · ${stamp.build}`);
