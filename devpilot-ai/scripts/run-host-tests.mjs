import { build } from 'esbuild';
import { mkdtemp,mkdir,writeFile,readFile,access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const executable=process.env.VSCODE_EXECUTABLE ?? (process.platform==='win32' && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA,'Programs','Microsoft VS Code','Code.exe') : undefined);
if(!executable) throw new Error('Set VSCODE_EXECUTABLE to your installed VS Code executable.');
await access(executable);
await import('../build.mjs');
const root=await mkdtemp(path.join(tmpdir(),'devpilot-host-'));
const fixture=path.join(root,'workspace');await mkdir(fixture);await writeFile(path.join(fixture,'fixture.ts'),'export const hello = 42;\n');
await build({entryPoints:['tests/host.integration.ts'],bundle:true,platform:'node',format:'cjs',external:['vscode'],outfile:'dist/host-tests.cjs'});
const env={...process.env,DEVPILOT_TEST_RESULT:path.join(root,'result.json')};
for(const key of Object.keys(env)) if(key.startsWith('VSCODE_')||key.startsWith('ELECTRON_')) delete env[key];
let output='';
const child=spawn(executable,['--new-window','--verbose','--user-data-dir='+path.join(root,'profile'),'--extensions-dir='+path.join(root,'extensions'),'--disable-extensions','--disable-workspace-trust','--skip-welcome','--skip-release-notes','--extensionDevelopmentPath='+process.cwd(),'--extensionTestsPath='+path.resolve('dist/host-tests.cjs'),fixture],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stdout.on('data',data=>{output+=data.toString();});child.stderr.on('data',data=>{output+=data.toString();});
const timer=setTimeout(()=>{if(process.platform==='win32') spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGKILL');},120000);
try {
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
 await writeFile(path.join(root,'host.log'),output);
 if(code!==0) {
   const updateBlocked=output.includes('Code is currently being updated');
   await writeFile(path.join(root,'status.json'),JSON.stringify({passed:false,blocked:updateBlocked,reason:updateBlocked?'VS Code updater lock':'Extension Host failed',exitCode:code}));
   throw new Error(`${updateBlocked?'Blocked by VS Code updater. Complete the pending update and retry.':`Extension Host exited ${code}.`} Logs: ${path.join(root,'host.log')}\n${output.split('\n').filter(line=>/Error: Code|still held|test failed/i.test(line)).join('\n')}`);
 }
 console.log(await readFile(env.DEVPILOT_TEST_RESULT,'utf8'));
} finally {clearTimeout(timer);}
