// @vitest-environment jsdom
import {afterEach,beforeEach,beforeAll,expect,it,vi} from 'vitest';
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import type * as vscode from 'vscode';
import {ChatViewProvider} from '../src/providers/ChatViewProvider';
import {workspace,commands} from './vscode.mock';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ToolRegistry} from '../src/tools/ToolRegistry';
import {WorkspaceService} from '../src/services/WorkspaceService';
import {fingerprint} from '../src/tools/FileEditor';
const api={postMessage:vi.fn(),getState:()=>undefined,setState:vi.fn()};
let App:typeof import('../webview-ui/src/App')['App'];let root:Root;let node:HTMLDivElement;let provider:ChatViewProvider;
interface Internals {mode:string;active?:AbortController;getTools:()=>unknown;sendState:()=>void;receiveClientMessage:(message:unknown)=>void;view:unknown;approvals:{pending?:{id:string};request:(title:string,action:string,signal:AbortSignal)=>Promise<boolean>}}
let state:Internals;
beforeAll(async()=>{vi.stubGlobal('acquireVsCodeApi',()=>api);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);App=(await import('../webview-ui/src/App')).App;HTMLElement.prototype.scrollIntoView=vi.fn();});
beforeEach(async()=>{
  vi.clearAllMocks();workspace.isTrusted=true;Object.assign(workspace,{getConfiguration:()=>({get:(_key:string,fallback:unknown)=>fallback}),workspaceFolders:[]});
  provider=new ChatViewProvider({} as vscode.Uri);state=provider as unknown as Internals;state.mode='agent';
  state.view={webview:{postMessage:(data:unknown)=>{window.dispatchEvent(new MessageEvent('message',{data}));return Promise.resolve(true);}}};
  api.postMessage.mockImplementation((message:{type:string})=>{if(message.type==='ready') state.sendState();else state.receiveClientMessage(message);});
  node=document.createElement('div');document.body.append(node);root=createRoot(node);await act(async()=>root.render(createElement(App)));
});
afterEach(async()=>{await act(async()=>{provider.dispose();root.unmount();});node.remove();});
async function click(selector:string) {const button=node.querySelector<HTMLButtonElement>(selector);expect(button).not.toBeNull();await act(async()=>button!.click());}
function approvalButton(text:string) {return [...node.querySelectorAll<HTMLButtonElement>('.approval button')].find(button=>button.textContent===text)!;}
it('routes actual Reject and Run command buttons through matching host approvals and renders the real exit code',async()=>{
  let executions=0;
  state.getTools=()=>({execute:async(_name:string,_input:unknown,_mode:string,signal:AbortSignal)=>{
    if(!await state.approvals.request('npm test in disposable sidebar fixture','Run command',signal)) return {approved:false};
    executions++;return {exitCode:1,output:'fixture failure'};
  }});
  await click('button[aria-label="Run npm tests"]');expect(node.querySelector('.approval')?.textContent).toContain('npm test in disposable');expect(executions).toBe(0);
  await act(async()=>state.receiveClientMessage({type:'approval',id:'00000000-0000-4000-8000-000000000000',approved:true}));expect(executions).toBe(0);expect(state.approvals.pending).toBeDefined();
  await act(async()=>approvalButton('Reject').click());expect(executions).toBe(0);expect(node.textContent).toContain('not executed because approval was rejected');
  await click('button[aria-label="Run npm tests"]');await act(async()=>approvalButton('Run command').click());expect(executions).toBe(1);expect(node.textContent).toContain('npm test exited 1');expect(node.querySelector('.approval')).toBeNull();
});
it('cancels a pending approval through Stop and prevents Plan mode from offering execution',async()=>{
  let executions=0;state.getTools=()=>({execute:async(_name:string,_input:unknown,_mode:string,signal:AbortSignal)=>{await state.approvals.request('Fixture command','Run command',signal);executions++;return {exitCode:0};}});
  await click('button[aria-label="Run npm tests"]');await click('button[aria-label="Stop generation"]');expect(state.approvals.pending).toBeUndefined();expect(executions).toBe(0);expect(node.textContent).toContain('stopped before completion');
  await act(async()=>state.receiveClientMessage({type:'setMode',mode:'plan'}));expect(node.querySelector<HTMLButtonElement>('button[aria-label="Run npm tests"]')?.disabled).toBe(true);
});
it('renders checkpoint review/undo and process stop controls with their policy restrictions',async()=>{
  const checkpoint='11111111-1111-4111-8111-111111111111';const job='22222222-2222-4222-8222-222222222222';
  const {WorkspacePanel}=await import('../webview-ui/src/WorkspacePanel');const post=vi.fn();
  await act(async()=>root.render(createElement(WorkspacePanel,{checkpoints:[{id:checkpoint,title:'Two-file fix',createdAt:1,files:['one.ts','two.ts'],records:2,canRevert:true}],jobs:[{id:job,script:'dev',status:'running',exitCode:null,startedAt:1,output:'server fixture',truncated:false}],busy:false,agent:true,trusted:true,post})));
  const buttons=[...node.querySelectorAll<HTMLButtonElement>('button')];await act(async()=>{buttons.find(button=>button.textContent==='two.ts')!.click();buttons.find(button=>button.textContent==='Undo task with review')!.click();buttons.find(button=>button.textContent==='Stop process')!.click();});
  expect(post.mock.calls.map(call=>call[0])).toEqual([{type:'reviewCheckpoint',id:checkpoint,path:'two.ts'},{type:'revertCheckpoint',id:checkpoint},{type:'stopProcess',id:job}]);expect(buttons.find(button=>button.textContent==='Run npm dev')!.disabled).toBe(true);
});

it('reviews, rejects and then approves grouped undo through the rendered sidebar and real FileEditor',async()=>{
  const folder=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'devpilot-sidebar-')));let setup=true;
  const tools=new ToolRegistry(new WorkspaceService(folder),()=>{},async(title,action,signal)=>setup?true:state.approvals.request(title,action,signal));
  workspace.openTextDocument.mockImplementation(async(uri:{fsPath:string})=>{const content=await fs.readFile(uri.fsPath,'utf8');return {isDirty:false,version:1,positionAt:()=>({line:0,character:0}),getText:()=>content,save:async()=>true};});
  workspace.applyEdit.mockImplementation(async(edit:unknown)=>{for(const op of (edit as {changes:unknown[][]}).changes) if(op[0]==='replace') await fs.writeFile((op[1] as {fsPath:string}).fsPath,op[3] as string);return true;});
  try {
    await fs.writeFile(path.join(folder,'one.ts'),'before one');await fs.writeFile(path.join(folder,'two.ts'),'before two');
    tools.editor.beginTask('11111111-1111-4111-8111-111111111111','Sidebar two-file task');
    await tools.editor.change('one.ts','after one',fingerprint('before one'),new AbortController().signal);await tools.editor.change('two.ts','after two',fingerprint('before two'),new AbortController().signal);tools.editor.endTask();setup=false;
    Object.assign(state,{tools,getTools:()=>tools});await act(async()=>{await (provider as unknown as {refreshWorkspaceView:()=>Promise<void>}).refreshWorkspaceView();});
    await click('.workspace-panel > summary');expect(node.querySelector('details.workspace-panel')?.hasAttribute('open')).toBe(true);
    const undo=()=>[...node.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Undo task with review')!;
    await act(async()=>{undo().click();await vi.waitFor(()=>expect(state.approvals.pending).toBeDefined());});
    expect(commands.executeCommand).toHaveBeenCalledWith('vscode.diff',expect.anything(),expect.anything(),expect.anything(),expect.anything());
    await act(async()=>{approvalButton('Reject').click();await vi.waitFor(()=>expect(state.active).toBeUndefined());});expect(await fs.readFile(path.join(folder,'two.ts'),'utf8')).toBe('after two');
    await act(async()=>{undo().click();await vi.waitFor(()=>expect(state.approvals.pending).toBeDefined());});const first=state.approvals.pending!.id;
    await act(async()=>{approvalButton('Apply change').click();await vi.waitFor(()=>{expect(state.approvals.pending).toBeDefined();expect(state.approvals.pending!.id).not.toBe(first);});});
    await act(async()=>{approvalButton('Apply change').click();await vi.waitFor(()=>expect(state.active).toBeUndefined());});
    expect(await fs.readFile(path.join(folder,'one.ts'),'utf8')).toBe('before one');expect(await fs.readFile(path.join(folder,'two.ts'),'utf8')).toBe('before two');expect(await tools.editor.checkpoints()).toEqual([]);
  } finally {provider.dispose();workspace.applyEdit.mockResolvedValue(true);await fs.rm(folder,{recursive:true,force:true});}
});
