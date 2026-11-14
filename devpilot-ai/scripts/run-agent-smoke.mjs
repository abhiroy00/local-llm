import { build } from 'esbuild';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const inspection=process.argv.includes('--inspection');
const root=await mkdtemp(path.join(tmpdir(),'devpilot-agent-'));
try {
  await writeFile(path.join(root,'fixture.ts'),'export const hello = 42;\n');
  if(inspection) {
    await writeFile(path.join(root,'README.md'),'# Fixture Library\nA tiny TypeScript library. fixture.ts exports a constant. There is no HTTP server or database.\n');
    await writeFile(path.join(root,'package.json'),JSON.stringify({name:'fixture-library',version:'1.0.0',main:'fixture.ts',dependencies:{}}));
  }
  await build({entryPoints:['scripts/agent-smoke.ts'],bundle:true,platform:'node',format:'cjs',outfile:'dist/agent-smoke.cjs'});
  const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['dist/agent-smoke.cjs',root,...(inspection?['--inspection']:[])],{stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',resolve);});
  if(code!==0) process.exitCode=1;
} finally {
  const target=path.resolve(root);
  if(!target.startsWith(path.resolve(tmpdir())+path.sep)||!path.basename(target).startsWith('devpilot-agent-')) throw new Error('Unexpected fixture cleanup path');
  await rm(target,{recursive:true,force:true});
}
