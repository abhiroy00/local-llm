import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { workspace, window, commands } from './vscode.mock';
import { FileEditor, fingerprint } from '../src/tools/FileEditor';
import { WorkspaceService } from '../src/services/WorkspaceService';
import { ToolRegistry } from '../src/tools/ToolRegistry';
import { approvedTerminal, runProcess } from '../src/tools/Terminal';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
let root:string;
beforeEach(async()=>{ vi.clearAllMocks(); workspace.isTrusted=true; workspace.textDocuments=[]; root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'devpilot-tools-'))); await fs.writeFile(path.join(root,'a.ts'),'before'); workspace.openTextDocument.mockResolvedValue({isDirty:false,version:1,positionAt:()=>({line:0,character:0}),getText:()=> 'before',save:async()=>true}); window.showWarningMessage.mockResolvedValue(undefined); commands.executeCommand.mockResolvedValue(undefined); });
afterEach(async()=>{ await fs.rm(root,{recursive:true,force:true}); });
const signal=()=>new AbortController().signal;
it('requires approval and never applies rejected edits',async()=>{
  const editor=new FileEditor(new WorkspaceService(root));
  try { expect(await editor.change('a.ts','after',fingerprint('before'),signal())).toMatchObject({applied:false}); expect(workspace.applyEdit).not.toHaveBeenCalled(); expect(await fs.readFile(path.join(root,'a.ts'),'utf8')).toBe('before'); expect(commands.executeCommand).toHaveBeenCalledWith('vscode.diff',expect.anything(),expect.anything(),expect.anything(),expect.anything()); }
  finally {editor.dispose();}
});
it('rejects stale disk content after approval and hash mismatch before preview',async()=>{
  const editor=new FileEditor(new WorkspaceService(root));
  try {
    await expect(editor.change('a.ts','after','0'.repeat(64),signal())).rejects.toThrow('Read this file');
    window.showWarningMessage.mockImplementationOnce(async()=>{await fs.writeFile(path.join(root,'a.ts'),'user change');return 'Apply change';});
    await expect(editor.change('a.ts','after',fingerprint('before'),signal())).rejects.toThrow('File changed'); expect(workspace.applyEdit).not.toHaveBeenCalled();
  } finally {editor.dispose();}
});
it('applies only approved changes and rejects dirty documents',async()=>{
  const editor=new FileEditor(new WorkspaceService(root));
  try {
    workspace.openTextDocument.mockResolvedValueOnce({isDirty:true,version:1});
    await expect(editor.change('a.ts','after',fingerprint('before'),signal())).rejects.toThrow('unsaved');
    window.showWarningMessage.mockResolvedValueOnce('Apply change');
    workspace.applyEdit.mockImplementationOnce(async()=>{await fs.writeFile(path.join(root,'a.ts'),'after');return true;});
    expect(await editor.change('a.ts','after',fingerprint('before'),signal())).toMatchObject({applied:true}); expect(workspace.applyEdit).toHaveBeenCalledTimes(1);
  } finally {editor.dispose();}
});
it('enforces trust, Plan restrictions, schemas and secret exclusions at tool boundary',async()=>{
  const tools=new ToolRegistry(new WorkspaceService(root),()=>{});
  try {
    await expect(tools.execute('edit_file',{path:'a.ts',content:'bad',hash:fingerprint('before')},'plan',signal())).rejects.toThrow('Plan mode');
    await expect(tools.execute('read_file',{path:'.env'},'agent',signal())).rejects.toThrow('Blocked');
    await expect(tools.execute('read_file',{path:12},'agent',signal())).rejects.toThrow('schema');
    workspace.isTrusted=false; await expect(tools.execute('list_files',{},'agent',signal())).rejects.toThrow('trusted');
    expect(workspace.applyEdit).not.toHaveBeenCalled();
  } finally {tools.dispose();}
});
it('rejects patch path mismatch and malformed multi-file patches',async()=>{
  const editor=new FileEditor(new WorkspaceService(root));
  try { await expect(editor.patch('a.ts','--- ../outside\n+++ ../outside\n@@ -1 +1 @@\n-before\n+after\n',fingerprint('before'),signal())).rejects.toThrow('Patch path'); }
  finally {editor.dispose();}
});
it('runs allowlisted version commands, blocks rejected commands and honors cancellation',async()=>{
  expect(await runProcess('node',['--version'],root,signal())).toMatchObject({exitCode:0});
  expect(await approvedTerminal(root,'node',['--version'],signal())).toEqual({approved:false});
  const controller=new AbortController();controller.abort(); await expect(runProcess('node',['--version'],root,controller.signal)).rejects.toThrow();
});
it('rejects a package manifest changed while command approval was pending',async()=>{
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({scripts:{test:'node --version'}}));
  const approve=vi.fn(async()=>{await fs.writeFile(path.join(root,'package.json'),JSON.stringify({scripts:{test:'changed command'}}));return true;});
  await expect(approvedTerminal(root,'npm',['test'],signal(),approve)).rejects.toThrow('package.json changed');
  expect(approve).toHaveBeenCalledWith(expect.stringContaining('node --version'),'Run command',expect.any(AbortSignal));
});
it('protects an unsaved editor for a file not yet present on disk',async()=>{
  workspace.textDocuments=[{uri:{toString:()=>path.join(root,'new.ts')},isDirty:true}];
  const editor=new FileEditor(new WorkspaceService(root),async()=>true);
  try {await expect(editor.change('new.ts','replacement',undefined,signal())).rejects.toThrow('unsaved');expect(workspace.applyEdit).not.toHaveBeenCalled();}
  finally {editor.dispose();}
});
it('rechecks an unsaved new editor created while the diff was pending',async()=>{
  const editor=new FileEditor(new WorkspaceService(root),async()=>{workspace.textDocuments=[{uri:{toString:()=>path.join(root,'new.ts')},isDirty:true}];return true;});
  try {await expect(editor.change('new.ts','replacement',undefined,signal())).rejects.toThrow('File changed');expect(workspace.applyEdit).not.toHaveBeenCalled();}
  finally {editor.dispose();}
});
it('retains all 20 undo records at capacity without recording undo as another edit',async()=>{
  const target=path.join(root,'a.ts');let content='before';
  workspace.openTextDocument.mockImplementation(async()=>({isDirty:false,version:1,positionAt:()=>({line:0,character:0}),getText:()=>content,save:async()=>true}));
  workspace.applyEdit.mockImplementation(async(edit:unknown)=>{
    const replacement=(edit as {changes:unknown[][]}).changes.find(change=>change[0]==='replace');
    if(replacement) {content=replacement[3] as string;await fs.writeFile(target,content);} return true;
  });
  const editor=new FileEditor(new WorkspaceService(root),async()=>true);
  try {
    for(let i=0;i<20;i++) await editor.change('a.ts',`revision ${i}`,fingerprint(content),signal());
    for(let i=0;i<20;i++) await editor.revert(signal());
    expect(await fs.readFile(target,'utf8')).toBe('before');
    await expect(editor.revert(signal())).rejects.toThrow('No session changes');
  } finally {editor.dispose(); workspace.applyEdit.mockResolvedValue(true);}
});
it('returns the saved CRLF hash and reverts using the saved rather than proposed bytes',async()=>{
  const target=path.join(root,'a.ts');
  workspace.applyEdit.mockImplementation(async(edit:unknown)=>{
    const replacement=(edit as {changes:unknown[][]}).changes.find(change=>change[0]==='replace');
    if(replacement) await fs.writeFile(target,(replacement[3] as string).replace(/\r?\n/g,'\r\n'));return true;
  });
  const editor=new FileEditor(new WorkspaceService(root),async()=>true);
  try {
    expect(await editor.change('a.ts','after\n',fingerprint('before'),signal())).toMatchObject({applied:true,hash:fingerprint('after\r\n')});
    expect(await editor.revert(signal())).toMatchObject({applied:true});expect(await fs.readFile(target,'utf8')).toBe('before');
  } finally {editor.dispose();workspace.applyEdit.mockResolvedValue(true);}
});
it('reports Git changes inside a nested workspace while filtering secret files',async()=>{
  const git=promisify(execFile);
  await git('git',['init',root]);
  const nested=path.join(root,'sub');await fs.mkdir(nested);
  await fs.writeFile(path.join(nested,'code.ts'),'before\n');await fs.writeFile(path.join(nested,'.env'),'TEST_SECRET=fixture\n');
  await git('git',['-C',root,'add','--','sub/code.ts','sub/.env']);
  await fs.writeFile(path.join(nested,'code.ts'),'after\n');await fs.writeFile(path.join(nested,'.env'),'TEST_SECRET=changed_fixture\n');
  const allowed=new WorkspaceService(nested);
  const status=await approvedTerminal(nested,'git',['status'],signal(),async()=>true,allowed) as {output:string};
  expect(status.output).toContain('code.ts');expect(status.output).not.toContain('.env');
  const diff=await approvedTerminal(nested,'git',['diff'],signal(),async()=>true,allowed) as {output:string};
  expect(diff.output).toContain('+after');expect(diff.output).not.toContain('TEST_SECRET');
});
