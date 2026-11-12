import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { parseClientMessage, type ChatMessage } from '../types';
import { OllamaService } from '../services/OllamaService';
import { WorkspaceService } from '../services/WorkspaceService';
import { AgentService } from '../services/AgentService';
import { ToolRegistry } from '../tools/ToolRegistry';
import { ApprovalService } from '../security/ApprovalService';

export class ChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private readonly approvals = new ApprovalService(() => this.sendState());
  private mode: 'chat'|'plan'|'agent' = 'chat';
  private timeline: {name:string;status:string}[] = [];
  private tools?: ToolRegistry;
  private workspaceRoot = '';
  private lastPlan = '';
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
      this.tools = new ToolRegistry(new WorkspaceService(this.workspaceRoot,excludes),(name,status) => { this.timeline.push({name,status}); this.timeline=this.timeline.slice(-60); this.sendState(); },this.approvals.request);
    }
    return this.tools;
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
    try { await this.getTools().editor.revert(controller.signal); } catch(error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Revert failed.'); } finally { if(this.active===controller) { this.active=undefined;this.sendState(); } }
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
    void this.view?.webview.postMessage({type:'state',messages:this.messages,models:this.models,model:this.model,error:this.error,connected:this.connected,busy:!!this.active,approval:this.approvals.pending,mode:this.mode,timeline:this.timeline,canExecutePlan:!!this.lastPlan,usage:this.usage,trusted:vscode.workspace.isTrusted});
  }
  private service(): OllamaService {
    return new OllamaService(vscode.workspace.getConfiguration('devpilot').get<string>('ollamaEndpoint','http://localhost:11434'));
  }
  private async refresh(): Promise<void> {
    this.discovery?.abort();
    const controller = new AbortController(); this.discovery = controller;
    try {
      const models = await this.service().models(controller.signal);
      if (this.discovery !== controller) return;
      this.models = models; this.connected = true;
      if (!models.includes(this.model)) this.model = models[0] ?? '';
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
    if (text) { this.lastPlan = ''; this.messages.push({role:'user',content:text}); }
    else if (this.messages.at(-1)?.role === 'assistant') this.messages.pop();
    if (this.messages.at(-1)?.role !== 'user') return;
    this.messages = this.messages.slice(-39);
    while (this.messages[0]?.role === 'assistant') this.messages.shift();
    const history = [...this.messages];
    const answer: ChatMessage = {role:'assistant',content:''}; this.messages.push(answer);
    const controller = new AbortController(); this.active = controller;
    this.error = ''; this.usage = undefined; this.timeline = []; this.lastPlan=''; this.sendState();
    const timeout = setTimeout(() => controller.abort('timeout'), this.mode === 'chat' ? 180000 : 600000);
    let publish: ReturnType<typeof setTimeout> | undefined;
    try {
      const limit = vscode.workspace.getConfiguration('devpilot').get<number>('contextLimit',4096);
      if (this.mode !== 'chat') {
        const mode = this.mode;
        const task = history.at(-1)!.content;
        const agent = new AgentService(this.service(),this.getTools());
        const summary = await agent.run(this.model,task,mode,limit,controller.signal,progress => { this.timeline.push({name:'agent',status:progress}); this.timeline=this.timeline.slice(-60); this.sendState(); });
        if(this.active !== controller) return;
        answer.content = summary;
        if(mode === 'plan') this.lastPlan = summary;
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
    } finally {
      clearTimeout(timeout); if (publish) clearTimeout(publish);
      if (this.active === controller) { this.active = undefined; this.sendState(); }
    }
  }
  private listeners: vscode.Disposable[] = [];
  constructor(private readonly extensionUri: vscode.Uri) {}
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
      const message = parseClientMessage(raw);
      if (!message) return;
      if (message.type === 'openSettings') void vscode.commands.executeCommand('devpilot.openSettings');
      if (message.type === 'newConversation') this.reset();
      if (message.type === 'ready') { this.sendState(); void this.refresh(); }
      if (message.type === 'refresh' && !this.active) void this.refresh();
      if (message.type === 'selectModel' && !this.active && this.models.includes(message.model)) { this.model = message.model; this.sendState(); }
      if (message.type === 'send') void this.generate(message.text);
      if (message.type === 'regenerate') void this.generate();
      if (message.type === 'approval') this.approvals.respond(message.id,message.approved);
      if (message.type === 'stop') this.active?.abort();
      if (message.type === 'setMode' && !this.active) { this.mode=message.mode; this.sendState(); }
      if (message.type === 'executePlan' && !this.active && this.lastPlan) { const task='Execute this approved plan. Verify changes when possible.\n'+this.lastPlan; this.mode='agent'; this.lastPlan=''; void this.generate(task); }
    }));
    this.listeners.push(vscode.workspace.onDidGrantWorkspaceTrust(() => this.sendState()));
    this.listeners.push(vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('devpilot') || event.affectsConfiguration('files.exclude') || event.affectsConfiguration('search.exclude')) { this.active?.abort(); this.tools?.dispose(); this.tools=undefined; void this.refresh(); } }));
    this.listeners.push(vscode.workspace.onDidChangeWorkspaceFolders(() => { this.active?.abort(); this.tools?.dispose(); this.tools=undefined; this.lastPlan=''; }));
    this.listeners.push(view.onDidDispose(() => { this.active?.abort(); this.discovery?.abort(); this.view = undefined; }));
  }
  reset(): void { this.active?.abort(); this.active = undefined; this.messages = []; this.timeline = []; this.lastPlan = ''; this.error = ''; this.usage = undefined; void this.view?.webview.postMessage({type:'reset'}); this.sendState(); }
  dispose(): void { this.tools?.dispose(); this.active?.abort(); this.discovery?.abort(); this.listeners.forEach(item => item.dispose()); this.listeners = []; }
}
