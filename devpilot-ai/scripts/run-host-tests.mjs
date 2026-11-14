import { build } from 'esbuild';
import { mkdtemp,mkdir,writeFile,readFile,access } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
let executable=process.env.VSCODE_EXECUTABLE;
if(process.env.DEVPILOT_DOWNLOAD_VSCODE==='1') {
  const {downloadAndUnzipVSCode}=await import('@vscode/test-electron');
  executable=await downloadAndUnzipVSCode('stable');
}
if(!executable) {
  const candidates=process.platform==='darwin'
    ? ['/Applications',path.join(homedir(),'Applications'),'/Volumes/VS Code'].flatMap(root=>['Code','Electron'].map(binary=>path.join(root,'Visual Studio Code.app','Contents','MacOS',binary)))
    : process.platform==='win32' ? [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA,'Programs','Microsoft VS Code','Code.exe'),process.env.ProgramFiles && path.join(process.env.ProgramFiles,'Microsoft VS Code','Code.exe'),process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'],'Microsoft VS Code','Code.exe')].filter(Boolean) : [];
  for(const candidate of candidates) {try {await access(candidate);executable=candidate;break;} catch { /* next conventional installation */ }}
}
if(!executable) throw new Error('Set VSCODE_EXECUTABLE to your installed VS Code executable.');
await access(executable);
const {stamp}=await import('../build.mjs');
const root=await mkdtemp(path.join(tmpdir(),'devpilot-host-'));
console.log('Isolated test directory: '+root);
const fixture=path.join(root,'workspace');await mkdir(fixture);await writeFile(path.join(fixture,'fixture.ts'),'export const hello = 42;\n');
await build({entryPoints:['tests/host.integration.ts'],bundle:true,platform:'node',format:'cjs',external:['vscode'],define:{__DEVPILOT_BUILD__:JSON.stringify(stamp)},outfile:'dist/host-tests.cjs'});
const reportDirectory=path.resolve('artifacts/native');await mkdir(reportDirectory,{recursive:true});
const caseName=process.env.DEVPILOT_AGENT_MODEL?`coding-${process.env.DEVPILOT_CODING_CASE ?? 'arithmetic'}-${process.env.DEVPILOT_MULTIFILE==='1'?'multi':'single'}`:'tools';
const reportPath=path.join(reportDirectory,`${process.platform}-${caseName}.json`);
const report=async(value)=>writeFile(reportPath,JSON.stringify({version:stamp.version,build:stamp.build,platform:process.platform,...value},null,2)+'\n');
const env={...process.env,DEVPILOT_TEST_RESULT:path.join(root,'result.json')};
for(const key of Object.keys(env)) if(key.startsWith('VSCODE_')||key.startsWith('ELECTRON_')) delete env[key];
let output='';
const child=spawn(executable,['--new-window','--user-data-dir='+path.join(root,'profile'),'--extensions-dir='+path.join(root,'extensions'),'--disable-extensions','--disable-workspace-trust','--skip-welcome','--skip-release-notes','--extensionDevelopmentPath='+process.cwd(),'--extensionTestsPath='+path.resolve('dist/host-tests.cjs'),fixture],{env,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
const capture=data=>{output=(output+data.toString()).slice(-256*1024);};
child.stdout.on('data',capture);child.stderr.on('data',capture);
const stop=()=>{
  if(!child.pid) return;
  if(process.platform==='win32') spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',()=>child.kill('SIGKILL'));
  else {try {process.kill(-child.pid,'SIGKILL');} catch {child.kill('SIGKILL');}}
};
const interrupted=()=>{stop();};process.once('SIGINT',interrupted);process.once('SIGTERM',interrupted);
const timer=setTimeout(stop,120000);
try {
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
 await writeFile(path.join(root,'host.log'),output);
 if(code!==0) {
   const updateBlocked=output.includes('Code is currently being updated');
   const modelStart=output.indexOf('MODEL CODING RESULT');
   const modelResult=modelStart>=0?output.slice(modelStart,output.indexOf('AssertionError',modelStart)>modelStart?output.indexOf('AssertionError',modelStart):modelStart+2000).slice(0,2500):undefined;
   if(modelResult) {await writeFile(path.join(root,'failure.json'),JSON.stringify({passed:false,model:process.env.DEVPILOT_AGENT_MODEL,multiFile:process.env.DEVPILOT_MULTIFILE==='1',modelResult},null,2));console.error(modelResult);}
   await report({passed:false,blocked:updateBlocked,reason:updateBlocked?'VS Code updater lock':'Extension Host failed',exitCode:code,modelResult});
   await writeFile(path.join(root,'status.json'),JSON.stringify({passed:false,blocked:updateBlocked,reason:updateBlocked?'VS Code updater lock':'Extension Host failed',exitCode:code}));
   throw new Error(`${updateBlocked?'Blocked by VS Code updater. Complete the pending update and retry.':`Extension Host exited ${code}.`} Logs: ${path.join(root,'host.log')}\n${output.split('\n').filter(line=>/Error: Code|still held|test failed/i.test(line)).join('\n')}`);
 }
 const result=JSON.parse(await readFile(env.DEVPILOT_TEST_RESULT,'utf8'));await report(result);console.log(JSON.stringify(result));
 console.log('Acceptance report: '+reportPath);
} finally {clearTimeout(timer);process.removeListener('SIGINT',interrupted);process.removeListener('SIGTERM',interrupted);}
