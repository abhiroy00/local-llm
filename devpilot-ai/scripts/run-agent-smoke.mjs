import { build } from 'esbuild';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const root=await mkdtemp(path.join(tmpdir(),'devpilot-agent-'));
try {
  await writeFile(path.join(root,'fixture.ts'),'export const hello = 42;\n');
  await build({entryPoints:['scripts/agent-smoke.ts'],bundle:true,platform:'node',format:'cjs',outfile:'dist/agent-smoke.cjs'});
  const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['dist/agent-smoke.cjs',root],{stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',resolve);});
  if(code!==0) process.exitCode=1;
} finally {
  const target=path.resolve(root);
  if(!target.startsWith(path.resolve(tmpdir())+path.sep)||!path.basename(target).startsWith('devpilot-agent-')) throw new Error('Unexpected fixture cleanup path');
  await rm(target,{recursive:true,force:true});
}
