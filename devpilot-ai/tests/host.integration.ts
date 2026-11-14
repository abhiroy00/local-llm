import {codingFixture} from './codingFixtures';
import {AgentService} from '../src/services/AgentService';
import {OllamaService} from '../src/services/OllamaService';
import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { WorkspaceService } from '../src/services/WorkspaceService';
import { ToolRegistry } from '../src/tools/ToolRegistry';
import { fingerprint } from '../src/tools/FileEditor';
import {randomUUID} from 'node:crypto';
import { approvedTerminal } from '../src/tools/Terminal';
export async function run():Promise<void> {
  const extension=vscode.extensions.getExtension('devpilot.devpilot-ai');
  assert.ok(extension,'DevPilot extension must be discoverable'); await extension.activate();
  assert.ok(extension.packageJSON.contributes.viewsContainers.secondarySidebar.some((item:{id:string})=>item.id==='devpilot'),'DevPilot must contribute to the right sidebar');
  const commands=await vscode.commands.getCommands(true);
  for(const command of ['openChat','newConversation','explainCode','fixCode','generateTests','indexWorkspace','revertChange','attachFile','setupModels','runNpmTests','reviewTask','undoTask','startDev']) assert.ok(commands.includes('devpilot.'+command),command);
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
    const edited=await tools.execute('replace_text',{path:'generated/hello.ts',oldText:'answer = 7',newText:'answer = 9',hash:created.hash},'agent',signal) as {hash:string};
    assert.equal(edited.hash,fingerprint(await fs.readFile(createdPath,'utf8')));
    assert.ok((await fs.readFile(createdPath,'utf8')).includes('= 9;'));
    await tools.editor.revert(signal);
    assert.ok((await fs.readFile(createdPath,'utf8')).includes('= 7;'));
    await tools.editor.revert(signal);
    await assert.rejects(fs.stat(createdPath));
    const command=await approvedTerminal(folder.uri.fsPath,'node',['--version'],signal,async()=>true) as {exitCode:number;output:string};
    assert.equal(command.exitCode,0);assert.match(command.output,/v\d+/);
    // Native multi-file changes and grouped undo, with real VS Code WorkspaceEdit.
    const taskId=randomUUID();tools.editor.beginTask(taskId,'Native multi-file checkpoint');
    await tools.execute('create_file',{path:'checkpoint-a.cjs',content:'exports.value = 1;\n'},'agent',signal);
    await tools.execute('create_file',{path:'checkpoint-b.cjs',content:'exports.value = 2;\n'},'agent',signal);
    tools.editor.endTask();assert.equal((await tools.editor.checkpoints())[0].files.length,2);
    await tools.editor.previewCheckpoint(taskId,'checkpoint-a.cjs');
    assert.deepEqual(await tools.editor.revertTask(taskId,signal),{reverted:2,remaining:0,stopped:false});
    await assert.rejects(fs.stat(vscode.Uri.joinPath(folder.uri,'checkpoint-a.cjs').fsPath));
    await assert.rejects(fs.stat(vscode.Uri.joinPath(folder.uri,'checkpoint-b.cjs').fsPath));
    // Real HTTP readiness and tree cleanup: output alone is never treated as readiness.
    await fs.writeFile(vscode.Uri.joinPath(folder.uri,'server.cjs').fsPath,`const http=require('node:http');const server=http.createServer((req,res)=>res.end('devpilot-fixture-ok'));server.listen(0,'127.0.0.1',()=>console.log('PORT='+server.address().port));`);
    await fs.writeFile(vscode.Uri.joinPath(folder.uri,'package.json').fsPath,JSON.stringify({private:true,scripts:{dev:'node server.cjs'}}));
    const job=await tools.background.start('dev',signal);assert.ok('id' in job);
    let port='';const deadline=Date.now()+10000;
    while(!port && Date.now()<deadline) {port=/PORT=(\d+)/.exec(tools.background.read(job.id).output)?.[1] ?? '';await new Promise(resolve=>setTimeout(resolve,50));}
    assert.ok(port,'Dev server should publish an ephemeral loopback port');
    assert.equal(await (await fetch('http://127.0.0.1:'+port)).text(),'devpilot-fixture-ok');
    assert.equal((await tools.background.stop(job.id)).status,'stopped');
    await assert.rejects(fetch('http://127.0.0.1:'+port));
    if(process.env.DEVPILOT_AGENT_MODEL) {
      // Every write/command below is confined to the harness-created disposable workspace.
      const fixture=codingFixture(process.env.DEVPILOT_MULTIFILE==='1',process.env.DEVPILOT_CODING_CASE==='strings');
      const multi=fixture.sources.length>1;
      const files=fixture.files as Record<string,string>;
      const trialPath=vscode.Uri.joinPath(folder.uri,fixture.sources[0]).fsPath;const original=files[fixture.sources[0]];
      for(const [file,content] of Object.entries(files)) await fs.writeFile(vscode.Uri.joinPath(folder.uri,file).fsPath,content);
      const baseline=await approvedTerminal(folder.uri.fsPath,'npm',['test'],signal,async()=>true) as {exitCode:number};
      assert.notEqual(baseline.exitCode,0,'The original bug must cause a failing test');
      const progress=(text:string)=>{
        console.log(text);
        if(process.env.DEVPILOT_TEST_RESULT) void fs.appendFile(process.env.DEVPILOT_TEST_RESULT+'.progress.jsonl',JSON.stringify({time:Date.now(),progress:text})+'\n').catch(()=>{});
      };
      progress('SMOKE: baseline failed as expected; starting model task');
      const recordedTools={guidance:(paths:string[])=>tools.guidance(paths),catalog:(mode:'plan'|'agent')=>tools.catalog(mode),execute:async(name:Parameters<typeof tools.execute>[0],input:unknown,mode:'plan'|'agent',signal:AbortSignal)=>{
        const result=await tools.execute(name,input,mode,signal);if(process.env.DEVPILOT_TEST_RESULT) await fs.appendFile(process.env.DEVPILOT_TEST_RESULT+'.tools.jsonl',JSON.stringify({name,input,result})+'\n');return result;
      }};
      const transport:typeof fetch=async(input,init)=>{
        const response=await fetch(input,init);
        if(String(input).endsWith('/api/chat') && process.env.DEVPILOT_TEST_RESULT) {
          const reader=response.clone().body?.getReader();let raw='';const decoder=new TextDecoder();
          if(reader) {try {while(raw.length<256*1024) {const chunk=await reader.read();raw+=decoder.decode(chunk.value,{stream:!chunk.done});if(chunk.done) break;}} finally {await reader.cancel().catch(()=>{});}}
          const frames=raw.split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return {};}});
          await fs.appendFile(process.env.DEVPILOT_TEST_RESULT+'.decisions.jsonl',JSON.stringify({content:frames.map(frame=>frame.message?.content ?? '').join('').slice(0,6000),done:frames.at(-1)})+'\n');
        }
        return response;
      };
      const agent=new AgentService(new OllamaService(process.env.DEVPILOT_OLLAMA_ENDPOINT ?? 'http://localhost:11434',transport,process.env.DEVPILOT_INFERENCE_PROFILE==='balanced'?'balanced':'low-memory'),recordedTools);
      const testsBefore=await fs.readFile(vscode.Uri.joinPath(folder.uri,fixture.test).fsPath,'utf8');
      const manifestBefore=await fs.readFile(vscode.Uri.joinPath(folder.uri,'package.json').fsPath,'utf8');
      tools.editor.beginTask(randomUUID(),multi?'Multi-file arithmetic repair':'Calculator repair');
      const result=await agent.run(process.env.DEVPILOT_AGENT_MODEL,fixture.task,'agent',4096,AbortSignal.timeout(90000),progress);
      console.log('MODEL CODING RESULT',result);
      assert.equal(await fs.readFile(vscode.Uri.joinPath(folder.uri,fixture.test).fsPath,'utf8'),testsBefore,'Tests must not be changed to fake a pass');
      assert.equal(await fs.readFile(vscode.Uri.joinPath(folder.uri,'package.json').fsPath,'utf8'),manifestBefore,'Test command must not be changed');
      assert.notEqual(await fs.readFile(trialPath,'utf8'),original,'Model must actually apply the edit');
      assert.ok(result.includes('Approved test command exited 0'),'Host must record a passing test after the last edit');
      const independent=await approvedTerminal(folder.uri.fsPath,'npm',['test'],signal,async()=>true) as {exitCode:number};
      assert.equal(independent.exitCode,0,'An independent test run must pass');
      tools.editor.endTask();
      if(multi) {const checkpoint=(await tools.editor.checkpoints())[0];assert.deepEqual([...checkpoint.files].sort(),[...fixture.sources].sort());await tools.editor.revertTask(checkpoint.id,signal);for(const file of fixture.sources) assert.equal(await fs.readFile(vscode.Uri.joinPath(folder.uri,file).fsPath,'utf8'),files[file]);}
      else await tools.editor.revert(signal);
      assert.equal(await fs.readFile(trialPath,'utf8'),original,'Undo must restore original bytes');
      const reverted=await approvedTerminal(folder.uri.fsPath,'npm',['test'],signal,async()=>true) as {exitCode:number};
      assert.notEqual(reverted.exitCode,0,'Tests must expose the original bug again after undo');
      progress('SMOKE: edit, passing tests and byte-exact undo verified');
    }
  } finally { tools.dispose(); }
  if(process.env.DEVPILOT_TEST_RESULT) await fs.writeFile(process.env.DEVPILOT_TEST_RESULT,JSON.stringify({passed:true,commands:true,webviewOpened:true,workspaceRead:true,planWriteBlocked:true,secretsBlocked:true,rejectedCreate:true,acceptedCreateEditRevert:true,approvedCommand:true,multiFileCheckpointUndo:true,backgroundHttpReadyAndStopped:true,codingModel:process.env.DEVPILOT_AGENT_MODEL ?? null,codingTrial:process.env.DEVPILOT_AGENT_MODEL?{case:process.env.DEVPILOT_CODING_CASE ?? 'arithmetic',multiFile:process.env.DEVPILOT_MULTIFILE==='1',baselineFailed:true,modelEdited:true,testsPassed:true,undoRestored:true,revertedTestsFailed:true}:null,approvalDriver:'test callback (not UI)'}));
}
