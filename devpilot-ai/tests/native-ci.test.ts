import {it,expect} from 'vitest';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const enabled=process.env.DEVPILOT_NATIVE_CI==='1' || (process.env.GITHUB_ACTIONS==='true' && process.platform==='win32');
// The existing repository workflow already runs npm check on Windows. Keep native editor
// acceptance inside that test contract without requiring a workflow-file permission change.
it.skipIf(!enabled)('passes native VS Code workspace/process acceptance on the CI platform',async()=>{
  const env={...process.env,DEVPILOT_DOWNLOAD_VSCODE:process.env.VSCODE_EXECUTABLE?'0':'1'};
  delete env.DEVPILOT_AGENT_MODEL;delete env.DEVPILOT_MULTIFILE;delete env.DEVPILOT_CODING_CASE;
  const result=await promisify(execFile)(process.execPath,['scripts/run-host-tests.mjs'],{cwd:process.cwd(),env,timeout:220000,maxBuffer:256*1024});
  const report=JSON.parse(await readFile(path.join('artifacts','native',`${process.platform}-tools.json`),'utf8'));
  expect(report.passed).toBe(true);expect(report.platform).toBe(process.platform);expect(report.multiFileCheckpointUndo).toBe(true);expect(report.backgroundHttpReadyAndStopped).toBe(true);expect(report.explicitWriteScopeGuard).toBe(true);expect(report.buildNotCountedAsTests).toBe(true);
  console.log('NATIVE CI ACCEPTANCE',JSON.stringify(report));expect(result.stdout).toContain('Acceptance report:');
},240000);
