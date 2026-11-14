import { AgentService } from '../src/services/AgentService';
import { OllamaService } from '../src/services/OllamaService';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { workspace, window, commands, languages } from './vscode.mock';
import { FileEditor, fingerprint } from '../src/tools/FileEditor';
import { WorkspaceService } from '../src/services/WorkspaceService';
import { PersistenceService, workspaceKey } from '../src/services/PersistenceService';
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
it('restores approved undo records after reopening persistent storage',async()=>{
  const storage=await fs.mkdtemp(path.join(os.tmpdir(),'devpilot-state-'));
  const target=path.join(root,'a.ts');let content='before';
  workspace.openTextDocument.mockImplementation(async()=>({isDirty:false,version:1,positionAt:()=>({line:0,character:0}),getText:()=>content,save:async()=>{await fs.writeFile(target,content);return true;}}));
  workspace.applyEdit.mockImplementation(async(edit:unknown)=>{
    const replacement=(edit as {changes:unknown[][]}).changes.find(change=>change[0]==='replace');
    if(replacement) {content=replacement[3] as string;await fs.writeFile(target,content);} return true;
  });
  try {
    const workspaceId=workspaceKey(root);
    const editor=new FileEditor(new WorkspaceService(root),async()=>true,await PersistenceService.open(storage),workspaceId);
    expect(await editor.change('a.ts','after',fingerprint('before'),signal())).toMatchObject({applied:true});
    editor.dispose();
    const reopened=new FileEditor(new WorkspaceService(root),async()=>true,await PersistenceService.open(storage),workspaceId);
    expect(await reopened.revert(signal())).toMatchObject({applied:true});
    expect(await fs.readFile(target,'utf8')).toBe('before');
    reopened.dispose();
  } finally { await fs.rm(storage,{recursive:true,force:true});workspace.applyEdit.mockResolvedValue(true); }
});
it('keeps Git status codes plus rename and delete entries while filtering secret files',async()=>{
  const git=promisify(execFile);
  await git('git',['init',root]);
  await git('git',['-C',root,'config','user.email','probe@example.com']);await git('git',['-C',root,'config','user.name','probe']);
  const nested=path.join(root,'sub');await fs.mkdir(nested);
  await fs.writeFile(path.join(nested,'code.ts'),'before\n');await fs.writeFile(path.join(nested,'old.ts'),'rename\n');
  await fs.writeFile(path.join(nested,'gone.ts'),'gone\n');await fs.writeFile(path.join(nested,'.env'),'TEST_SECRET=fixture\n');
  await git('git',['-C',root,'add','-A']);await git('git',['-C',root,'commit','-m','init']);
  await fs.writeFile(path.join(nested,'code.ts'),'after\n');await fs.writeFile(path.join(nested,'.env'),'TEST_SECRET=changed_fixture\n');
  await fs.unlink(path.join(nested,'gone.ts'));await git('git',['-C',root,'mv','sub/old.ts','sub/new.ts']);
  const allowed=new WorkspaceService(nested);
  const status=await approvedTerminal(nested,'git',['status'],signal(),async()=>true,allowed) as {output:string};
  expect(status.output).toContain('M code.ts');expect(status.output).toContain('D gone.ts');expect(status.output).toContain('old.ts -> new.ts');expect(status.output).not.toContain('.env');
  const diff=await approvedTerminal(nested,'git',['diff'],signal(),async()=>true,allowed) as {output:string};
  expect(diff.output).toContain('gone.ts');expect(diff.output).toContain('deleted file mode');expect(diff.output).not.toContain('TEST_SECRET');
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
it('paginates file reads and returns a hash of the complete original bytes',async()=>{
  const source=Array.from({length:500},(_,i)=>`line ${i+1} ${'x'.repeat(30)}`).join('\n');
  await fs.writeFile(path.join(root,'large.ts'),source);
  const tools=new ToolRegistry(new WorkspaceService(root),()=>{});
  try {
    const first=await tools.execute('read_file',{path:'large.ts'},'plan',signal());
    expect(first).toMatchObject({hash:fingerprint(source),truncated:true,totalLines:500,startLine:1});
    const tail=await tools.execute('read_file',{path:'large.ts',startLine:499,endLine:500},'plan',signal());
    expect(tail).toMatchObject({hash:fingerprint(source),content:source.split('\n').slice(498).join('\n'),startLine:499,endLine:500,truncated:true});
    await expect(tools.execute('read_file',{path:'large.ts',startLine:600},'plan',signal())).rejects.toThrow('Invalid line range');
  } finally {tools.dispose();}
});
it('requires a unique replacement, rejects Plan writes, and routes edits through diff approval',async()=>{
  await fs.writeFile(path.join(root,'a.ts'),'same same');
  const approve=vi.fn(async()=>false);const tools=new ToolRegistry(new WorkspaceService(root),()=>{},approve);
  try {
    const input={path:'a.ts',oldText:'same',newText:'next',hash:fingerprint('same same')};
    await expect(tools.execute('replace_text',input,'agent',signal())).rejects.toThrow('exactly once');
    await expect(tools.execute('replace_text',{...input,oldText:'same same'},'plan',signal())).rejects.toThrow('Plan mode');
    expect(await tools.execute('replace_text',{...input,oldText:'same same'},'agent',signal())).toMatchObject({applied:false});
    expect(approve).toHaveBeenCalledTimes(1);expect(workspace.applyEdit).not.toHaveBeenCalled();
  } finally {tools.dispose();}
});
it('publishes validated plans without needing mutation permission',async()=>{
  const onPlan=vi.fn();const tools=new ToolRegistry(new WorkspaceService(root),()=>{},undefined,undefined,onPlan);
  try {
    const steps=[{title:'Inspect source',status:'in_progress'}];
    expect(await tools.execute('update_plan',{steps},'plan',signal())).toEqual({steps});expect(onPlan).toHaveBeenCalledWith(steps);
    await expect(tools.execute('update_plan',{steps:[{title:'Invalid',status:'invented'}]},'agent',signal())).rejects.toThrow('schema');
  } finally {tools.dispose();}
});

it('filters diagnostics to allowed workspace paths and preserves one-based locations',async()=>{
  const uri=(name:string)=>({scheme:'file',fsPath:path.join(root,name)});
  const diagnostic={range:{start:{line:2,character:3}},severity:0,message:'Type mismatch',source:'ts'};
  Object.assign(workspace,{asRelativePath:(value:{fsPath:string})=>path.relative(root,value.fsPath)});
  languages.getDiagnostics.mockReturnValueOnce([[uri('a.ts'),[diagnostic]],[uri('.env'),[diagnostic]],[{scheme:'file',fsPath:'/outside.ts'},[diagnostic]]] as never);
  const tools=new ToolRegistry(new WorkspaceService(root),()=>{});
  try {expect(await tools.execute('get_diagnostics',{},'plan',signal())).toEqual({diagnostics:[{file:'a.ts',line:3,column:4,severity:'error',message:'Type mismatch',source:'ts'}],truncated:false});}
  finally {tools.dispose();}
});
it('uses language navigation providers while excluding outside and sensitive locations',async()=>{
  const range={start:{line:0,character:0},end:{line:0,character:6}};
  commands.executeCommand.mockResolvedValueOnce([{uri:{scheme:'file',fsPath:path.join(root,'a.ts')},range},{uri:{scheme:'file',fsPath:path.join(root,'.env')},range},{uri:{scheme:'file',fsPath:'/outside.ts'},range}] as never);
  const tools=new ToolRegistry(new WorkspaceService(root),()=>{});
  try {
    expect(await tools.execute('find_references',{path:'a.ts',line:1,column:1},'plan',signal())).toMatchObject({locations:[{file:'a.ts',line:1,column:1}],truncated:false});
    expect(commands.executeCommand).toHaveBeenCalledWith('vscode.executeReferenceProvider',expect.anything(),expect.anything());
    await expect(tools.execute('go_to_definition',{path:'a.ts',line:99,column:1},'plan',signal())).rejects.toThrow('outside the document');
  } finally {tools.dispose();}
});
it('flattens document symbols into bounded source ranges',async()=>{
  const range={start:{line:0,character:0},end:{line:3,character:0}};
  commands.executeCommand.mockResolvedValueOnce([{name:'Example',kind:4,range,children:[{name:'run',kind:5,range,children:[]}]}] as never);
  const tools=new ToolRegistry(new WorkspaceService(root),()=>{});
  try {expect(await tools.execute('document_symbols',{path:'a.ts'},'plan',signal())).toMatchObject({symbols:[{name:'Example',kind:4,line:1,endLine:4},{name:'run',kind:5,line:1,endLine:4}]});}
  finally {tools.dispose();}
});

it('preserves CRLF source bytes in read excerpts for exact targeted replacements',async()=>{
  const content='first\r\nsecond\r\n';await fs.writeFile(path.join(root,'a.ts'),content);
  const tools=new ToolRegistry(new WorkspaceService(root),()=>{},async()=>false);
  try {
    expect(await tools.execute('read_file',{path:'a.ts'},'plan',signal())).toMatchObject({content,hash:fingerprint(content)});
    expect(await tools.execute('replace_text',{path:'a.ts',oldText:'first\r\nsecond',newText:'updated',hash:fingerprint(content)},'agent',signal())).toMatchObject({applied:false});
  } finally {tools.dispose();}
});

it('enforces explicit read-only user requests even when the sidebar is in Agent mode',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  const call=vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'run_terminal',input:{executable:'node',args:['--version']}}).mockResolvedValueOnce({action:'final',summary:'Command was blocked.'});
  const approve=vi.fn(async()=>true);const tools=new ToolRegistry(new WorkspaceService(root),()=>{},approve);
  try {
    expect(await new AgentService(ollama,tools).run('test','Do not modify files or run commands. Check the version.','agent',4096,signal(),()=>{})).toContain('Command was blocked');
    expect(approve).not.toHaveBeenCalled();expect(JSON.stringify(call.mock.calls[1][1])).toContain('Plan mode cannot');
  } finally {tools.dispose();}
});

it('persists grouped multi-file checkpoints, preflights all files and resumes a rejected task undo',async()=>{
  const storage=await fs.mkdtemp(path.join(os.tmpdir(),'devpilot-checkpoints-'));const id='11111111-1111-1111-1111-111111111111';
  await fs.writeFile(path.join(root,'b.ts'),'second');
  workspace.openTextDocument.mockImplementation(async(uri:{fsPath:string})=>({isDirty:false,version:1,positionAt:()=>({line:0,character:0}),getText:()=>'',save:async()=>{await fs.access(uri.fsPath);return true;}}));
  workspace.applyEdit.mockImplementation(async(edit:unknown)=>{for(const op of (edit as {changes:unknown[][]}).changes) {const uri=op[1] as {fsPath:string};if(op[0]==='replace') await fs.writeFile(uri.fsPath,op[3] as string);}return true;});
  let editor=new FileEditor(new WorkspaceService(root),async()=>true,await PersistenceService.open(storage),workspaceKey(root));
  try {
    editor.beginTask(id,'Two file fix');await editor.change('a.ts','after',fingerprint('before'),signal());await editor.change('b.ts','updated',fingerprint('second'),signal());editor.endTask();editor.dispose();
    let approve=true;editor=new FileEditor(new WorkspaceService(root),async()=>approve,await PersistenceService.open(storage),workspaceKey(root));
    expect(await editor.checkpoints()).toMatchObject([{id,files:['a.ts','b.ts'],records:2,canRevert:true}]);
    await fs.writeFile(path.join(root,'a.ts'),'manual');await expect(editor.revertTask(id,signal())).rejects.toThrow('stale');expect(await fs.readFile(path.join(root,'b.ts'),'utf8')).toBe('updated');
    await fs.writeFile(path.join(root,'a.ts'),'after');approve=false;expect(await editor.revertTask(id,signal())).toMatchObject({reverted:0,remaining:2,stopped:true});
    approve=true;expect(await editor.revertTask(id,signal())).toMatchObject({reverted:2,remaining:0,stopped:false});
    expect(await fs.readFile(path.join(root,'a.ts'),'utf8')).toBe('before');expect(await fs.readFile(path.join(root,'b.ts'),'utf8')).toBe('second');expect(await editor.checkpoints()).toEqual([]);
  } finally {editor.dispose();workspace.applyEdit.mockResolvedValue(true);await fs.rm(storage,{recursive:true,force:true});}
});

it('evicts whole older tasks at capacity and refuses a 21st task edit without losing its checkpoint',async()=>{
  let content='before';workspace.openTextDocument.mockImplementation(async()=>({isDirty:false,version:1,positionAt:()=>({line:0,character:0}),getText:()=>content,save:async()=>true}));
  workspace.applyEdit.mockImplementation(async(edit:unknown)=>{const op=(edit as {changes:unknown[][]}).changes.find(item=>item[0]==='replace');if(op) {content=op[3] as string;await fs.writeFile(path.join(root,'a.ts'),content);}return true;});
  const editor=new FileEditor(new WorkspaceService(root),async()=>true);const first='11111111-1111-1111-1111-111111111111';const second='22222222-2222-2222-2222-222222222222';
  try {
    editor.beginTask(first,'Earlier task');await editor.change('a.ts','older',fingerprint(content),signal());editor.endTask();editor.beginTask(second,'Current task');
    for(let i=0;i<20;i++) await editor.change('a.ts','revision '+i,fingerprint(content),signal());
    await expect(editor.change('a.ts','overflow',fingerprint(content),signal())).rejects.toThrow('Task change limit');
    expect(await editor.checkpoints()).toMatchObject([{id:second,records:20}]);expect((await editor.checkpoints()).length).toBe(1);
    editor.endTask();await editor.revertTask(second,signal());expect(content).toBe('older');
  } finally {editor.dispose();workspace.applyEdit.mockResolvedValue(true);}
});

it('collects scoped root/nested project guidance and marks oversized guidance incomplete',async()=>{
  await fs.mkdir(path.join(root,'src'));await fs.writeFile(path.join(root,'AGENTS.md'),'Keep public exports stable.');await fs.writeFile(path.join(root,'src','AGENTS.md'),'Use existing tests.');
  const tools=new ToolRegistry(new WorkspaceService(root),()=>{});
  try {
    expect(await tools.guidance(['a.ts','src/widget.ts'])).toMatchObject({'a.ts':{complete:true,content:expect.stringContaining('Keep public exports')},'src/widget.ts':{complete:true,content:expect.stringContaining('Use existing tests')}});
    await fs.writeFile(path.join(root,'src','AGENTS.md'),'long instructions '.repeat(200));expect((await tools.guidance(['src/widget.ts']))['src/widget.ts'].complete).toBe(false);
  } finally {tools.dispose();}
});

it('rejects raw binary/control characters before preview or file mutation',async()=>{
  const editor=new FileEditor(new WorkspaceService(root),async()=>true);
  try {for(const content of ['source\u0000text','regex\btext']) await expect(editor.change('a.ts',content,fingerprint('before'),signal())).rejects.toThrow('raw control characters');expect(workspace.applyEdit).not.toHaveBeenCalled();expect(commands.executeCommand).not.toHaveBeenCalled();expect(await fs.readFile(path.join(root,'a.ts'),'utf8')).toBe('before');}
  finally {editor.dispose();}
});
