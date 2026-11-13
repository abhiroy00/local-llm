import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { WorkspaceService } from '../src/services/WorkspaceService';
import { ToolRegistry } from '../src/tools/ToolRegistry';
import { fingerprint } from '../src/tools/FileEditor';
import { approvedTerminal } from '../src/tools/Terminal';
export async function run():Promise<void> {
  const extension=vscode.extensions.getExtension('devpilot.devpilot-ai');
  assert.ok(extension,'DevPilot extension must be discoverable'); await extension.activate();
  const commands=await vscode.commands.getCommands(true);
  for(const command of ['openChat','newConversation','explainCode','fixCode','generateTests','indexWorkspace','revertChange','showAuditLog','clearAuditLog']) assert.ok(commands.includes('devpilot.'+command),command);
  await vscode.commands.executeCommand('devpilot.openChat');
  const folder=vscode.workspace.workspaceFolders?.[0]; assert.ok(folder);
  let approve=true;
  const tools=new ToolRegistry(new WorkspaceService(folder.uri.fsPath),()=>{},async()=>approve);
  try {
    const listing=await tools.execute('list_files',{},'plan',new AbortController().signal) as {files:string[]}; assert.ok(listing.files.includes('fixture.ts'));
    const read=await tools.execute('read_file',{path:'fixture.ts'},'plan',new AbortController().signal) as {content:string;hash:string}; assert.ok(read.content.includes('hello')); assert.equal(read.hash.length,64);
    await assert.rejects(tools.execute('create_file',{path:'never.ts',content:'blocked'},'plan',new AbortController().signal),/Plan mode/);
    await assert.rejects(tools.execute('read_file',{path:'.env'},'plan',new AbortController().signal),/Blocked workspace path/);
    const signal=new AbortController().signal;
    approve=false;
    assert.deepEqual(await tools.execute('create_file',{path:'rejected.ts',content:'never'},'agent',signal),{applied:false,reason:'User rejected the change.'});
    await assert.rejects(fs.stat(vscode.Uri.joinPath(folder.uri,'rejected.ts').fsPath));
    approve=true;
    const created=await tools.execute('create_file',{path:'generated/hello.ts',content:'export const answer = 7;\n'},'agent',signal) as {hash:string};
    const createdPath=vscode.Uri.joinPath(folder.uri,'generated','hello.ts').fsPath;
    assert.equal(created.hash,fingerprint(await fs.readFile(createdPath,'utf8')));
    const edited=await tools.execute('edit_file',{path:'generated/hello.ts',content:'export const answer = 9;\n',hash:created.hash},'agent',signal) as {hash:string};
    assert.equal(edited.hash,fingerprint(await fs.readFile(createdPath,'utf8')));
    await tools.editor.revert(signal);
    assert.ok((await fs.readFile(createdPath,'utf8')).includes('= 7;'));
    await tools.editor.revert(signal);
    await assert.rejects(fs.stat(createdPath));
    const command=await approvedTerminal(folder.uri.fsPath,'node',['--version'],signal,async()=>true) as {exitCode:number;output:string};
    assert.equal(command.exitCode,0);assert.match(command.output,/v\d+/);
  } finally { tools.dispose(); }
  if(process.env.DEVPILOT_TEST_RESULT) await fs.writeFile(process.env.DEVPILOT_TEST_RESULT,JSON.stringify({passed:true,commands:true,webviewOpened:true,workspaceRead:true,planWriteBlocked:true,secretsBlocked:true,rejectedCreate:true,acceptedCreateEditRevert:true,approvedCommand:true,approvalDriver:'test callback (not UI)'}));
}
