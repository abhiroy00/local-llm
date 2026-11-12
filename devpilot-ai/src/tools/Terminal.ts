import { spawn } from 'node:child_process';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import * as vscode from 'vscode';
import { WorkspaceService } from '../services/WorkspaceService';
import type { ApprovalFunction } from '../security/ApprovalService';

import { validateCommand } from '../security/Commands';
export async function runProcess(executable: string,args: string[],cwd: string,signal: AbortSignal): Promise<{exitCode:number|null;output:string;truncated:boolean}> {
  validateCommand(executable,args); signal.throwIfAborted();
  return new Promise((resolve,reject) => {
    const windows = process.platform === 'win32';
    const actualArgs = executable === 'git' ? ['-c','core.fsmonitor=false','-c','status.relativePaths=true','--no-pager',...(args[0] === 'diff' ? ['diff','--relative','--no-ext-diff','--no-textconv'] : ['status','--short','--untracked-files=all','--','.'])] : args;
    const child = windows && executable === 'npm'
      ? spawn(process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe',['/d','/s','/c',`npm ${args.join(' ')}`],{cwd,windowsHide:true,stdio:['ignore','pipe','pipe']})
      : spawn(executable,actualArgs,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],detached:!windows});
    let output = ''; let truncated = false; let stopped = false;
    const capture = (chunk: Buffer) => { const text = chunk.toString(); if (output.length + text.length > 20000) truncated = true; output = (output + text).slice(0,20000); };
    const stop = () => { stopped = true; if (child.pid) { if (windows) spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',() => child.kill()).on('exit',code => { if (code !== 0) child.kill(); }); else { try { process.kill(-child.pid,'SIGKILL'); } catch { child.kill('SIGKILL'); } } } };
    const timeout = setTimeout(stop,60000); signal.addEventListener('abort',stop,{once:true});
    if (signal.aborted) stop();
    child.stdout.on('data',capture); child.stderr.on('data',capture);
    const cleanup = () => { clearTimeout(timeout); signal.removeEventListener('abort',stop); };
    child.on('error',error => { cleanup(); reject(error); });
    child.on('close',code => { cleanup(); if (stopped) reject(new Error('Command cancelled or timed out after 60 seconds.')); else resolve({exitCode:code,output,truncated}); });
  });
}
export async function approvedTerminal(root: string,executable:string,args:string[],signal:AbortSignal,approve?:ApprovalFunction,allowedWorkspace?:WorkspaceService): Promise<unknown> {
  validateCommand(executable,args); signal.throwIfAborted();
  if (!vscode.workspace.isTrusted) throw new Error('Workspace trust required.');
  const realRoot = await fs.realpath(root);
  let scripts = '';
  let approvedManifest:string|undefined;
  const manifestPath=path.join(root,'package.json');
  const readManifest=async()=>{const stat=await fs.lstat(manifestPath);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1||stat.size>128*1024) throw new Error('Invalid package.json');return fs.readFile(manifestPath,'utf8');};
  if (executable === 'npm') { approvedManifest=await readManifest(); const pkg = JSON.parse(approvedManifest); const name=args[0] === 'test' ? 'test' : args[1]; const selected=Object.fromEntries(['pre'+name,name,'post'+name].map(key=>[key,pkg.scripts?.[key] ?? '(not defined)'])); const preview=JSON.stringify(selected,null,2); if(preview.length>6000) throw new Error('Script preview too long. Inspect/run the command manually.'); scripts = '\nSelected scripts and lifecycle hooks:\n'+preview; }
  const title=`Run ${executable} ${args.join(' ')}?\nDirectory: ${root}\nProject scripts and tests execute project code and may modify files or access the network.${scripts}`;
  const approved=approve ? await approve(title,'Run command',signal) : (await vscode.window.showWarningMessage(title,{modal:true},'Run command'))==='Run command';
  signal.throwIfAborted(); if (!approved) return {approved:false};
  if (!vscode.workspace.isTrusted || await fs.realpath(root) !== realRoot) throw new Error('Workspace changed or is untrusted.');
  if(approvedManifest!==undefined && await readManifest()!==approvedManifest) throw new Error('package.json changed during approval. Review the command again.');
  const result = await runProcess(executable,args,root,signal);
  if(executable === 'git' && result.exitCode === 0) {
    const workspace = allowedWorkspace ?? new WorkspaceService(root,vscode.workspace.getConfiguration('devpilot').get<string[]>('ignorePatterns',[]));
    const allowed = new Set((await workspace.files(signal)).files);
    // Deleted and renamed-away paths are absent from the listing but are still valid,
    // non-sensitive workspace paths, so resolve them with allowMissing.
    const included = async (file: string) => {
      if (allowed.has(file)) return true;
      // C-quoted unusual names cannot be validated reliably, so keep them filtered.
      if (file.startsWith('"')) return false;
      try { await workspace.resolve(file, true); return true; } catch { return false; }
    };
    if(args[0] === 'diff') {
      const blocks: string[] = [];
      for (const block of result.output.split(/(?=^diff --git )/m)) {
        const match=/^diff --git a\/(.*?) b\/(.*?)\r?$/m.exec(block);
        if (match && await included(match[1]) && await included(match[2])) blocks.push(block);
      }
      result.output = blocks.join('');
    } else {
      const lines: string[] = [];
      for (const line of result.output.split(/\r?\n/)) {
        if (!line) continue;
        const paths = line.slice(3).split(' -> ');
        if (paths.length && (await Promise.all(paths.map(included))).every(Boolean)) lines.push(line);
      }
      result.output = lines.join('\n');
    }
  }
  return result;
}
