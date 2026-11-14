import type {CheckpointSummary} from '../types/workspace';
import { modelProfile, type HardwareInfo } from '../models/ModelCatalog';
import { hardwareInfo } from '../models/Hardware';
import {runtimeBuild,type RuntimeInfo} from '../types/runtime';
import * as vscode from 'vscode';
import { randomBytes, randomUUID } from 'node:crypto';
import { parseClientMessage, type ChatMessage } from '../types';
import { OllamaService } from '../services/OllamaService';
import { WorkspaceService } from '../services/WorkspaceService';
import { AgentService } from '../services/AgentService';
import { ToolRegistry } from '../tools/ToolRegistry';
import { ApprovalService } from '../security/ApprovalService';
import { PersistenceService, workspaceKey, type ConversationSummary } from '../services/PersistenceService';

export class ChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private checkpoints:CheckpointSummary[]=[];
  private async refreshWorkspaceView():Promise<void> {
    try {if(!this.tools && vscode.workspace.isTrusted && vscode.workspace.workspaceFolders?.length) this.getTools();this.checkpoints=this.tools?await this.tools.editor.checkpoints():[];} catch {this.checkpoints=[];}
    this.sendState();
  }
  async reviewCheckpoint(id:string,path:string):Promise<void> {
    if(this.active) return;try {await this.getTools().editor.previewCheckpoint(id,path);} catch(error) {this.error=error instanceof Error?error.message:'Review failed.';this.sendState();}
  }
  async revertCheckpoint(id:string):Promise<void> {
    if(this.active) return;if(this.mode!=='agent') {this.error='Switch to Agent mode before reverting a task.';this.sendState();return;}
    const controller=new AbortController();this.active=controller;this.error='';this.sendState();
    try {const result=await this.getTools().editor.revertTask(id,controller.signal);this.messages.push({role:'assistant',content:`Task undo: ${result.reverted} change record(s) reverted; ${result.remaining} remaining.${result.stopped?' Rejected proposal stopped further undo.':''} Commands and manual edits are outside this checkpoint.`});await this.persistConversation();}
    catch(error) {this.error=error instanceof Error?error.message:'Task undo failed.';}
    finally {if(this.active===controller) this.active=undefined;await this.refreshWorkspaceView();}
  }
  async reviewLatestTask():Promise<void> {
    if(this.active) return;await this.refreshWorkspaceView();const latest=this.checkpoints[0];
    if(!latest) {this.error='No retained task changes to review.';this.sendState();return;}
    const file=await vscode.window.showQuickPick(latest.files,{placeHolder:'Review a changed file from the latest task'});if(file) await this.reviewCheckpoint(latest.id,file);
  }
  async undoLatestTask():Promise<void> {
    if(this.active) return;await this.refreshWorkspaceView();const latest=this.checkpoints[0];
    if(!latest) {this.error='No retained task changes to undo.';this.sendState();return;}await this.revertCheckpoint(latest.id);
  }
  async startProcess(script:'dev'|'start'):Promise<void> {
    if(this.active) return;if(this.mode!=='agent') {this.error='Switch to Agent mode before starting a process.';this.sendState();return;}
    const controller=new AbortController();this.active=controller;this.error='';this.sendState();
    try {await this.getTools().execute('start_process',{script},'agent',controller.signal);}
    catch(error) {this.error=error instanceof Error?error.message:'Process start failed.';}
    finally {if(this.active===controller) this.active=undefined;this.sendState();}
  }
  async stopProcess(id:string):Promise<void> {try {await this.getTools().background.stop(id);this.sendState();} catch(error) {this.error=error instanceof Error?error.message:'Process stop failed.';this.sendState();}}
  private hardware?:HardwareInfo;
  private modelSetupVisible=false;
  private download?:{profileId:string;status:string;percent?:number};
  openModelSetup():void {this.modelSetupVisible=true;this.sendState();}
  async installModel(profileId:string):Promise<void> {
    if(this.active) return;
    const profile=modelProfile(profileId);const controller=new AbortController();this.active=controller;this.error='';
    this.modelSetupVisible=true;this.download={profileId,status:'Connecting to local Ollama…'};this.sendState();
    try {
      let last=0;
      await this.service().pull(profileId,controller.signal,event=>{
        if(this.active!==controller) return;
        this.download={profileId,status:event.status,percent:event.total ? Math.min(100,Math.floor((event.completed ?? 0)/event.total*100)) : undefined};
        if(Date.now()-last>150 || event.status==='success') {last=Date.now();this.sendState();}
      });
      controller.signal.throwIfAborted();await this.refresh();
      if(!this.models.includes(profile.model)) throw new Error('Ollama completed the download but the model was not listed. Refresh models to retry.');
      this.model=profile.model;await this.preferences?.update('selectedModel',this.model);
      this.download={profileId,status:'Installed and selected. Try a small task first.'};
    } catch(error) {this.error=controller.signal.aborted ? 'Download stopped. Cached layers may remain in Ollama; retry to resume.' : error instanceof Error ? error.message : 'Model setup failed.';this.download=undefined;}
    finally {if(this.active===controller) {this.active=undefined;this.sendState();}}
  }
  private view?: vscode.WebviewView;
  private readonly approvals = new ApprovalService(() => this.sendState());
  private mode: 'chat'|'plan'|'agent' = 'agent';
  private timeline: {name:string;status:string;detail?:string}[] = [];
  private tools?: ToolRegistry;
  private workspaceRoot = '';
  private lastPlan = '';
  private attachments:string[]=[];
  private planSteps:{title:string;status:'pending'|'in_progress'|'completed'}[]=[];
  private activeConversationId?:string;
  private conversationWorkspace?:string;
  private conversations:ConversationSummary[]=[];
  private getTools(): ToolRegistry {
    if (!vscode.workspace.isTrusted) throw new Error('Workspace tools require a trusted folder.');
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) throw new Error('Open your project folder before using Plan or Agent mode.');
    const editorFolder = vscode.window.activeTextEditor ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri) : undefined;
    const folder = editorFolder ?? folders[0];
    if (folder.uri.scheme !== 'file') throw new Error('Only local filesystem workspaces are supported.');
    if (!this.tools || this.workspaceRoot !== folder.uri.fsPath) {
      this.tools?.dispose(); this.workspaceRoot = folder.uri.fsPath;
      const excludes=[...vscode.workspace.getConfiguration('devpilot').get<string[]>('ignorePatterns',[])];
      for(const section of ['files','search']) for(const [pattern,enabled] of Object.entries(vscode.workspace.getConfiguration(section).get<Record<string,unknown>>('exclude',{}))) if(enabled === true) excludes.push(pattern);
      this.tools = new ToolRegistry(new WorkspaceService(this.workspaceRoot,excludes),(name,status,detail) => { this.timeline.push({name,status,detail}); this.timeline=this.timeline.slice(-60); this.sendState(); },this.approvals.request,this.persistence,steps=>{this.planSteps=steps;this.sendState();},()=>this.sendState());
    }
    return this.tools;
  }
  async runNpmTests():Promise<void> {
    if(this.active) return;
    if(this.mode!=='agent') {this.error='Switch to Agent mode to run npm tests. Plan and Chat do not execute commands.';this.sendState();return;}
    const controller=new AbortController();this.active=controller;this.error='';this.timeline=[];this.lastPlan='';this.sendState();
    const timer=setTimeout(()=>controller.abort('timeout'),240000);
    try {
      const result=await this.getTools().execute('run_tests',{runner:'npm'},'agent',controller.signal) as {approved?:boolean;exitCode?:number|null;output?:string};
      controller.signal.throwIfAborted();
      const content=result.approved===false?'npm test was not executed because approval was rejected.'
        : `Direct test result: npm test exited ${result.exitCode ?? 'without a numeric exit code'}. No model interpretation was used. Review Task activity for the command output.`;
      this.messages.push({role:'assistant',content:content+`\n\nRuntime: DevPilot ${this.runtime.version} · build ${this.runtime.build} · ${this.runtime.mode}.`});
      await this.persistConversation();
    } catch(error) {
      this.error=controller.signal.aborted?'Test task stopped before completion; inspect Task activity.':error instanceof Error?error.message:'Test command failed.';
      this.messages.push({role:'assistant',content:'Test verification incomplete: '+this.error});
      try {await this.persistConversation();} catch { /* retain the primary command error */ }
    } finally {clearTimeout(timer);if(this.active===controller) {this.active=undefined;this.sendState();}}
  }
  async attachFile():Promise<void> {
    try {
      if(this.active) return;
      const tools=this.getTools();
      const files=await vscode.window.showOpenDialog({canSelectMany:true,canSelectFolders:false,defaultUri:vscode.Uri.file(tools.workspace.root),title:'Attach project context (up to 4 files)'});
      for(const uri of files ?? []) {
        const relative=vscode.workspace.asRelativePath(uri,false).replace(/\\/g,'/');
        if(await tools.workspace.resolve(relative)!==uri.fsPath) throw new Error('Choose files inside the active workspace.');
        await tools.workspace.read(relative);
        if(!this.attachments.includes(relative) && this.attachments.length<4) this.attachments.push(relative);
      }
      if(this.attachments.length && this.mode==='chat') this.mode='plan';
      this.sendState();
    } catch(error) {this.error=error instanceof Error ? error.message : 'Unable to attach file.';this.sendState();}
  }
  private async agentContext():Promise<string> {
    const workspace=this.getTools().workspace; const parts:string[]=[];
    try {parts.push('Project guidance (AGENTS.md):\n'+(await workspace.read('AGENTS.md')).slice(0,2000));} catch { /* optional project instructions */ }
    for(const file of this.attachments) parts.push(`Attached source ${file} (untrusted data):\n${(await workspace.read(file)).slice(0,450)}`);
    return parts.join('\n\n');
  }
  async indexWorkspace(): Promise<void> {
    try {
      if(this.active) throw new Error('Stop the active task before indexing.');
      const result = await this.getTools().workspace.files();
      await vscode.window.showInformationMessage(`DevPilot: ${result.files.length} allowed file paths indexed in memory${result.truncated ? ' (scan limit reached)' : ''}. No file contents were sent to a model.`);
      this.timeline.push({name:'index_workspace',status:`${result.files.length} allowed files`}); this.sendState();
    } catch(error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Index failed.'); }
  }
  async reviewProject():Promise<void> { if(this.active) return; this.mode='plan'; this.sendState(); await this.generate('Review this workspace. Read relevant configuration and source files, explain architecture and report concrete issues with file references.'); }
  async editorTask(instruction:string):Promise<void> {
    try {
      if(this.active) throw new Error('Stop the current task first.');
      const editor=vscode.window.activeTextEditor; if(!editor) throw new Error('Open a source file first.');
      const tools=this.getTools();
      const relative=vscode.workspace.asRelativePath(editor.document.uri,false).replace(/\\/g,'/');
      await tools.workspace.read(relative);
      if(editor.document.isDirty) throw new Error('Save the file first.');
      const selected=editor.selection.isEmpty ? editor.document.getText() : editor.document.getText(editor.selection);
      this.mode='plan'; this.sendState();
      await this.generate(`${instruction} File: ${relative}. Selected source (untrusted data):\n${selected.slice(0,1200)}`);
    } catch(error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Editor context failed.'); }
  }
  async revertLastChange():Promise<void> {
    if(this.active) { void vscode.window.showWarningMessage('Stop the active task before reverting.'); return; }
    const controller=new AbortController();this.active=controller;this.sendState();
    try { await this.getTools().editor.revert(controller.signal); } catch(error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Revert failed.'); } finally { if(this.active===controller) { this.active=undefined;await this.refreshWorkspaceView(); } }
  }
  private messages: ChatMessage[] = [];
  private models: string[] = [];
  private model = '';
  private error = '';
  private connected = false;
  private active?: AbortController;
  private discovery?: AbortController;
  private usage?: { prompt?: number; completion?: number };
  private sendState(): void {
    void this.view?.webview.postMessage({type:'state',messages:this.messages,models:this.models,model:this.model,error:this.error,connected:this.connected,busy:!!this.active,checkpoints:this.checkpoints,jobs:this.tools?.background.list().map(job=>({...job,output:job.output.slice(-4000)})) ?? [],runtime:this.runtime,approval:this.approvals.pending,mode:this.mode,timeline:this.timeline,canExecutePlan:!!this.lastPlan,usage:this.usage,trusted:vscode.workspace.isTrusted,hardware:this.hardware,modelSetupVisible:this.modelSetupVisible,inferenceProfile:vscode.workspace.getConfiguration('devpilot').get<string>('inferenceProfile','low-memory'),download:this.download,attachments:this.attachments,planSteps:this.planSteps,workspaceName:vscode.workspace.workspaceFolders?.[0]?.name ?? 'No workspace',conversations:this.conversations,activeConversationId:this.activeConversationId});
  }
  private service(): OllamaService {
    return new OllamaService(vscode.workspace.getConfiguration('devpilot').get<string>('ollamaEndpoint','http://localhost:11434'),fetch,vscode.workspace.getConfiguration('devpilot').get<'low-memory'|'balanced'>('inferenceProfile','low-memory'));
  }
  private currentWorkspaceKey():string {
    const folders=vscode.workspace.workspaceFolders;
    const editorFolder=vscode.window.activeTextEditor ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri) : undefined;
    const folder=editorFolder ?? folders?.[0];
    return folder ? workspaceKey(folder.uri.fsPath) : 'unscoped';
  }
  private async restoreConversations():Promise<void> {
    if(!this.persistence) return;
    const workspace=this.currentWorkspaceKey();
    this.conversations=await this.persistence.listConversations(workspace);
    if(this.activeConversationId && this.conversationWorkspace===workspace) { this.sendState(); return; }
    this.activeConversationId=undefined;this.conversationWorkspace=undefined;this.messages=[];
    const latest=this.conversations[0];
    if(latest) {
      this.messages=await this.persistence.getConversation(workspace,latest.id) ?? [];
      if(this.messages.at(-1)?.role==='assistant' && !this.messages.at(-1)?.content) this.messages.pop();
      this.activeConversationId=latest.id;this.conversationWorkspace=workspace;
    }
    this.sendState();
  }
  private async persistConversation():Promise<void> {
    if(!this.persistence || !this.messages.length) return;
    this.activeConversationId ??= randomUUID();
    this.conversationWorkspace ??= this.currentWorkspaceKey();
    await this.persistence.saveConversation(this.conversationWorkspace,this.activeConversationId,this.messages);
    this.conversations=await this.persistence.listConversations(this.conversationWorkspace);
    this.sendState();
  }
  private async selectConversation(id:string):Promise<void> {
    if(this.active || !this.persistence || !this.conversations.some(item => item.id===id)) return;
    const workspace=this.currentWorkspaceKey();
    const messages=await this.persistence.getConversation(workspace,id);
    if(!messages) throw new Error('Saved conversation could not be loaded.');
    if(messages.at(-1)?.role==='assistant' && !messages.at(-1)?.content) messages.pop();
    this.activeConversationId=id;this.conversationWorkspace=workspace;this.messages=messages;this.mode='chat';this.lastPlan='';this.timeline=[];this.error='';this.usage=undefined;this.sendState();
  }
  private async deleteConversation(id:string):Promise<void> {
    if(this.active || !this.persistence || !this.conversations.some(item => item.id===id)) return;
    const answer=await vscode.window.showWarningMessage('Delete this saved conversation? This cannot be undone.',{modal:true},'Delete');
    if(answer!=='Delete') return;
    const workspace=this.currentWorkspaceKey();
    await this.persistence.deleteConversation(workspace,id);
    this.conversations=await this.persistence.listConversations(workspace);
    if(this.activeConversationId===id) { this.activeConversationId=undefined;this.conversationWorkspace=undefined;this.messages=[];await this.restoreConversations(); }
    this.sendState();
  }
  private async refresh(): Promise<void> {
    this.discovery?.abort();
    const controller = new AbortController(); this.discovery = controller;
    try {
      const models = await this.service().models(controller.signal);
      if (this.discovery !== controller) return;
      this.models = models; this.connected = true;
      if (!models.includes(this.model)) {const preferred=vscode.workspace.getConfiguration('devpilot').get<string>('defaultModel','deepseek-coder:1.3b');this.model=models.includes(preferred)?preferred:models[0] ?? '';}
      if(!models.length) this.modelSetupVisible=true;
      this.error = models.length ? '' : 'No installed models. Install a chat model in Ollama, then refresh.';
    } catch (error) {
      if (this.discovery !== controller) return;
      this.connected = false; this.models = []; this.model = '';
      this.error = error instanceof Error ? error.message : 'Connection failed.';
    } finally { if (this.discovery === controller) { this.discovery = undefined; this.sendState(); } }
  }
  private async generate(text?: string): Promise<void> {
    if (this.active) return;
    if (!this.connected || !this.models.includes(this.model)) { this.error = 'Connect to Ollama and select an installed model first.'; this.sendState(); return; }
    if(this.conversationWorkspace && this.conversationWorkspace!==this.currentWorkspaceKey()) {this.attachments=[];await this.restoreConversations();}
    if (text) { this.lastPlan = ''; this.messages.push({role:'user',content:text}); }
    else if (this.messages.at(-1)?.role === 'assistant') this.messages.pop();
    if (this.messages.at(-1)?.role !== 'user') return;
    this.messages = this.messages.slice(-39);
    while (this.messages[0]?.role === 'assistant') this.messages.shift();
    const history = [...this.messages];
    const answer: ChatMessage = {role:'assistant',content:''}; this.messages.push(answer);
    const controller = new AbortController(); this.active = controller;
    this.error = ''; this.usage = undefined; this.timeline = []; this.planSteps=[]; this.lastPlan=''; this.sendState();
    const timeout = setTimeout(() => controller.abort('timeout'), this.mode === 'chat' ? 180000 : 600000);
    let publish: ReturnType<typeof setTimeout> | undefined;let taskTools:ToolRegistry|undefined;
    try {
      await this.persistConversation();
      const limit = vscode.workspace.getConfiguration('devpilot').get<number>('contextLimit',4096);
      if (this.mode !== 'chat') {
        const mode = this.mode;
        const task = history.at(-1)!.content;
        taskTools=this.getTools();taskTools.editor.beginTask(randomUUID(),task);
        const agent = new AgentService(this.service(),taskTools);
        const summary = await agent.run(this.model,task,mode,limit,controller.signal,progress => { this.timeline.push({name:'agent',status:progress}); this.timeline=this.timeline.slice(-60); this.sendState(); },{runtime:this.runtime,maxSteps:vscode.workspace.getConfiguration('devpilot').get<number>('maxSteps',40),history:history.slice(0,-1),context:await this.agentContext()});
        if(this.active !== controller) return;
        answer.content = summary;
        if(mode === 'plan' && !/^(Stopped|Unable|No allowed files|Failed)/i.test(summary) && /\b(plan|propose|implement|fix|refactor|add|build)\b/i.test(task)) this.lastPlan = summary;
        return;
      }
      const usage = await this.service().chat(this.model,history,limit,controller.signal, chunk => {
        answer.content += chunk;
        if (!publish) publish = setTimeout(() => { publish = undefined; if (this.active === controller) this.sendState(); },50);
      });
      if (this.active !== controller) return;
      this.usage = usage;
      this.messages = this.messages.slice(-40);
    } catch (error) {
      if (this.active !== controller) return;
      this.error = controller.signal.aborted ? (controller.signal.reason === 'timeout' ? 'Task timed out. Inspect any applied changes, then try a narrower task or smaller model.' : 'Generation stopped. Partial response retained.') : error instanceof Error ? error.message : 'Generation failed.';
      if(!answer.content.trim()) answer.content='Task incomplete: '+this.error+' No final answer was produced. Inspect task activity and any workspace changes before retrying.';
    } finally {
      taskTools?.editor.endTask();
      clearTimeout(timeout); if (publish) clearTimeout(publish);
      if (this.active === controller) {
        try { await this.persistConversation(); }
        catch(error) { this.error=`Response completed but conversation history could not be saved: ${error instanceof Error ? error.message : 'Storage failed.'}`; }
        this.active = undefined; await this.refreshWorkspaceView();
      }
    }
  }
  private listeners: vscode.Disposable[] = [];
  constructor(private readonly extensionUri: vscode.Uri,private readonly persistence?:PersistenceService,private readonly preferences?:vscode.Memento,private readonly runtime:RuntimeInfo={...runtimeBuild,mode:'unknown'}) {this.model=preferences?.get<string>('selectedModel','') ?? '';}
  private receiveClientMessage(raw:unknown):void {
      const message = parseClientMessage(raw);
      if (!message) return;
      if(message.type==='reviewCheckpoint') void this.reviewCheckpoint(message.id,message.path);
      if(message.type==='revertCheckpoint') void this.revertCheckpoint(message.id);
      if(message.type==='startProcess') void this.startProcess(message.script);
      if(message.type==='stopProcess') void this.stopProcess(message.id);
      if(message.type==='runNpmTests') void this.runNpmTests();
      if(message.type==='openModelSetup') this.openModelSetup();
      if(message.type==='closeModelSetup') {this.modelSetupVisible=false;this.sendState();}
      if(message.type==='installModel') void this.installModel(message.profileId);
      if(message.type==='modelSource') void vscode.env.openExternal(vscode.Uri.parse(modelProfile(message.profileId).source));
      if(message.type==='attachFile') void this.attachFile();
      if(message.type==='removeAttachment' && !this.active) {this.attachments=this.attachments.filter(file=>file!==message.path);this.sendState();}
      if(message.type==='revertChange') void this.revertLastChange();
      if(message.type==='indexWorkspace') void this.indexWorkspace();
      if (message.type === 'openSettings') void vscode.commands.executeCommand('devpilot.openSettings');
      if (message.type === 'newConversation') this.reset();
      if (message.type === 'ready') {
        this.sendState();
        void hardwareInfo().then(info=>{this.hardware=info;this.sendState();});
        void this.restoreConversations().then(()=>this.refreshWorkspaceView()).then(() => this.refresh()).catch(error => { this.error=error instanceof Error ? error.message : 'Conversation history could not be loaded.';this.sendState(); });
      }
      if (message.type === 'refresh' && !this.active) void this.refresh();
      if (message.type === 'selectModel' && !this.active && this.models.includes(message.model)) { this.model = message.model; void this.preferences?.update('selectedModel',this.model);this.sendState(); }
      if (message.type === 'selectConversation') void this.selectConversation(message.id).catch(error => { this.error=error instanceof Error ? error.message : 'Conversation could not be loaded.';this.sendState(); });
      if (message.type === 'deleteConversation') void this.deleteConversation(message.id).catch(error => { this.error=error instanceof Error ? error.message : 'Conversation could not be deleted.';this.sendState(); });
      if (message.type === 'send') void this.generate(message.text);
      if (message.type === 'regenerate') void this.generate();
      if (message.type === 'approval') this.approvals.respond(message.id,message.approved);
      if (message.type === 'stop') this.active?.abort();
      if (message.type === 'setMode' && !this.active) { this.mode=message.mode; this.sendState(); }
      if (message.type === 'executePlan' && !this.active && this.lastPlan) { const task='Execute this approved plan. Verify changes when possible.\n'+this.lastPlan; this.mode='agent'; this.lastPlan=''; void this.generate(task); }
  }
  resolveWebviewView(view: vscode.WebviewView): void {
    this.listeners.forEach(item => item.dispose());
    this.listeners = [];
    this.view = view;
    const root = vscode.Uri.joinPath(this.extensionUri, 'dist');
    view.webview.options = { enableScripts: true, localResourceRoots: [root] };
    const nonce = randomBytes(24).toString('hex');
    const script = view.webview.asWebviewUri(vscode.Uri.joinPath(root, 'webview.js'));
    const style = view.webview.asWebviewUri(vscode.Uri.joinPath(root, 'webview.css'));
    view.webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${view.webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${view.webview.cspSource};"><link href="${style}" rel="stylesheet"><title>DevPilot AI</title></head><body><div id="root"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
    this.listeners.push(view.webview.onDidReceiveMessage((raw: unknown) => {
      this.receiveClientMessage(raw);
    }));
    this.listeners.push(vscode.workspace.onDidGrantWorkspaceTrust(() => this.sendState()));
    this.listeners.push(vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('devpilot') || event.affectsConfiguration('files.exclude') || event.affectsConfiguration('search.exclude')) { this.active?.abort(); if(event.affectsConfiguration('devpilot.ignorePatterns') || event.affectsConfiguration('files.exclude') || event.affectsConfiguration('search.exclude')) {this.tools?.dispose();this.tools=undefined;void this.refreshWorkspaceView();} void this.refresh(); } }));
    this.listeners.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.active?.abort(); this.tools?.dispose(); this.tools=undefined; this.lastPlan='';
      this.activeConversationId=undefined;this.conversationWorkspace=undefined;this.messages=[];this.conversations=[];this.attachments=[];this.planSteps=[];this.checkpoints=[];this.sendState();
      void this.restoreConversations().then(()=>this.refreshWorkspaceView()).catch(error => { this.error=error instanceof Error ? error.message : 'Conversation history could not be loaded.';this.sendState(); });
    }));
    this.listeners.push(view.onDidDispose(() => { this.active?.abort(); this.discovery?.abort(); this.view = undefined; }));
  }
  reset(): void { this.active?.abort(); this.active = undefined; this.messages = []; this.activeConversationId=undefined;this.conversationWorkspace=undefined;this.timeline = []; this.planSteps=[]; this.attachments=[]; this.lastPlan = ''; this.error = ''; this.usage = undefined; void this.view?.webview.postMessage({type:'reset'}); this.sendState(); }
  dispose(): void { this.tools?.dispose(); this.active?.abort(); this.discovery?.abort(); this.listeners.forEach(item => item.dispose()); this.listeners = []; }
}
