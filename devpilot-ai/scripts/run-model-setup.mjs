import {build} from 'esbuild';
import {spawn} from 'node:child_process';
await build({entryPoints:['scripts/model-setup.ts'],bundle:true,platform:'node',format:'cjs',outfile:'dist/model-setup.cjs'});
const child=spawn(process.execPath,['dist/model-setup.cjs',...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code ?? 1;});
