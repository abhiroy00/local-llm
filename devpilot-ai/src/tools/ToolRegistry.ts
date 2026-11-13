import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { WorkspaceService } from '../services/WorkspaceService';
import { FileEditor, fingerprint } from './FileEditor';
import { approvedTerminal } from './Terminal';
import { SemanticIndex } from '../indexing/SemanticIndex';
import { OllamaService } from '../services/OllamaService';
import { PersistenceService, workspaceKey, type AuditEvent } from '../services/PersistenceService';
import { containsSecrets, redactSecrets } from '../security/SecretRedactor';
import type { ApprovalFunction } from '../security/ApprovalService';

import { schemas, outputSchemas, writeTools, toolCatalog, type ToolName } from './ToolSchemas';
export type { ToolName } from './ToolSchemas';
interface AuditContext { taskId:string;tool:string;argsSummary:string;approval:AuditEvent['approval'] }
function redactOutput(value:unknown):{value:unknown;count:number} {
  if(typeof value==='string') { const safe=redactSecrets(value);return {value:safe.text,count:safe.count}; }
  if(Array.isArray(value)) {
    let count=0;
    const items=value.map(item=>{const safe=redactOutput(item);count+=safe.count;return safe.value;});
    return {value:items,count};
  }
  if(value && typeof value==='object') {
    let count=0;const record:Record<string,unknown>={};
    for(const [key,item] of Object.entries(value)) { const safe=redactOutput(item);record[key]=safe.value;count+=safe.count; }
    return {value:record,count};
  }
  return {value,count:0};
}
function summarizeArguments(data:Record<string,unknown>):string {
  const summary:Record<string,unknown>={};
  if(typeof data.path==='string') summary.path=redactSecrets(data.path).text;
  if(typeof data.query==='string') summary.query=`[omitted ${data.query.length} characters]`;
  if(typeof data.content==='string') summary.content=`[omitted ${data.content.length} characters]`;
  if(typeof data.patch==='string') summary.patch=`[omitted ${data.patch.length} characters]`;
  if(typeof data.hash==='string') summary.hasExpectedHash=true;
  if(typeof data.executable==='string') summary.executable=data.executable;
  if(Array.isArray(data.args)) summary.args=data.args;
  if(typeof data.runner==='string') summary.runner=data.runner;
  return JSON.stringify(summary);
}
function summarizeResult(result:unknown):string {
  if(!result || typeof result!=='object') return '';
  const value=result as Record<string,unknown>,summary:Record<string,unknown>={};
  for(const key of ['file','applied','approved','exitCode','truncated','indexed']) if(key in value) summary[key]=value[key];
  for(const key of ['files','matches','symbols']) if(Array.isArray(value[key])) summary[key+'Count']=(value[key] as unknown[]).length;
  return JSON.stringify(summary);
}
export class ToolRegistry implements vscode.Disposable {
  readonly editor: FileEditor;
  private semantic?: SemanticIndex;
  private auditContext?:AuditContext;
  private readonly approvalProxy?:ApprovalFunction;
  constructor(readonly workspace: WorkspaceService, private readonly log:(name:string,status:string)=>void,private readonly approve?:ApprovalFunction,private readonly persistence?:PersistenceService) {
    if(approve) this.approvalProxy=async(title,action,signal)=>{
      const context=this.auditContext;
      try {
        const approved=await approve(title,action,signal);
        if(context) context.approval=approved?'approved':'rejected';
        return approved;
      } catch(error) {
        if(context) context.approval='unknown';
        throw error;
      }
    };
    this.editor = new FileEditor(workspace,this.approvalProxy,persistence,workspaceKey(workspace.root));
  }
  private async recordAudit(context:AuditContext,outcome:AuditEvent['outcome'],approval:AuditEvent['approval'],resultSummary:string,detail?:string):Promise<void> {
    await this.persistence?.appendAuditEvent({taskId:context.taskId,tool:context.tool,argsSummary:context.argsSummary,approval,outcome,resultSummary,detail});
  }
  catalog(mode:'plan'|'agent'): unknown {
    return toolCatalog(mode);
  }
  async execute(name: ToolName,input: unknown,mode:'plan'|'agent',signal:AbortSignal,taskId?:string): Promise<unknown> {
    signal.throwIfAborted();
    if (!vscode.workspace.isTrusted) throw new Error('Open a trusted local workspace before using tools.');
    if (!Object.hasOwn(schemas,name)) throw new Error('Unknown tool.');
    if (mode === 'plan' && writeTools.has(name)) throw new Error('Plan mode cannot modify files or execute commands.');
    const parsed = schemas[name].safeParse(input); if (!parsed.success) throw new Error('Tool arguments do not match the input schema.');
    const data = parsed.data as Record<string, unknown>;
    const context:AuditContext={taskId:taskId ?? randomUUID(),tool:name,argsSummary:summarizeArguments(data),approval:writeTools.has(name)?'pending':'not_required'};
    this.auditContext=context;
    this.log(name,'running');
    try {
      await this.recordAudit(context,'started',context.approval,'');
      let result: unknown;
      switch(name) {
        case 'search_semantic': {
          const config=vscode.workspace.getConfiguration('devpilot');const model=config.get<string>('embeddingModel','');
          if(!model) throw new Error('Semantic search is disabled. Configure an installed Embedding Model, or use search_code.');
          this.semantic ??= new SemanticIndex(this.workspace,new OllamaService(config.get<string>('ollamaEndpoint','http://localhost:11434')),model,this.persistence,workspaceKey(this.workspace.root));
          result=await this.semantic.search(data.query as string,signal); break;
        }
        case 'list_files': result = await this.workspace.files(signal); break;
        case 'read_file': { const content = await this.workspace.read(data.path as string); result = {path:data.path,hash:fingerprint(content),content:content.slice(0,12000),truncated:content.length>12000}; break; }
        case 'search_code': case 'search_files': result = await this.workspace.search(data.query as string,name === 'search_files',signal); break;
        case 'create_file': {
          if(containsSecrets(data.content as string)) throw new Error('Proposed file contains a detected credential. Remove it and use a local environment variable instead.');
          try { await this.workspace.read(data.path as string); throw new Error('File already exists; use edit_file.'); }
          catch(error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
          result = await this.editor.change(data.path as string,data.content as string,undefined,signal); break;
        }
        case 'edit_file': {
          const current=await this.workspace.read(data.path as string);
          if(containsSecrets(current)) throw new Error('Agent edits are blocked for files containing detected credentials. Remove or rotate the secret manually first.');
          if(containsSecrets(data.content as string)) throw new Error('Proposed file contains a detected credential. Remove it and use a local environment variable instead.');
          result = await this.editor.change(data.path as string,data.content as string,data.hash as string,signal); break;
        }
        case 'apply_patch': {
          const current=await this.workspace.read(data.path as string);
          if(containsSecrets(current)) throw new Error('Agent patches are blocked for files containing detected credentials. Remove or rotate the secret manually first.');
          if(containsSecrets(data.patch as string)) throw new Error('Proposed patch contains a detected credential. Remove it and use a local environment variable instead.');
          result = await this.editor.patch(data.path as string,data.patch as string,data.hash as string,signal); break;
        }
        case 'delete_file': result = await this.editor.change(data.path as string,undefined,data.hash as string,signal); break;
        case 'run_terminal': result = await approvedTerminal(this.workspace.root,data.executable as string,data.args as string[],signal,this.approvalProxy,this.workspace); break;
        case 'run_tests': result = await approvedTerminal(this.workspace.root,data.runner === 'npm' ? 'npm' : 'python',data.runner === 'npm' ? ['test'] : ['-m','pytest'],signal,this.approvalProxy,this.workspace); break;
        case 'git_status': case 'git_diff': result = await approvedTerminal(this.workspace.root,'git',[name === 'git_status' ? 'status' : 'diff'],signal,this.approvalProxy,this.workspace); break;
        case 'get_workspace_info': { const listing = await this.workspace.files(signal); result = {name:vscode.Uri.file(this.workspace.root).path.split('/').at(-1),files:listing.files.length,truncated:listing.truncated}; break; }
        case 'inspect_dependencies': { const dependencies: Record<string,string> = {}; for (const path of ['package.json','pyproject.toml','requirements.txt']) { try { dependencies[path] = (await this.workspace.read(path)).slice(0,6000); } catch { /* absent or excluded manifests */ } } result = {manifests:dependencies}; break; }
        case 'search_symbols': {
          const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeWorkspaceSymbolProvider',data.query);
          const found: unknown[] = [];
          for (const symbol of (symbols ?? []).slice(0,100)) { const relative = vscode.workspace.asRelativePath(symbol.location.uri,false).replace(/\\/g,'/'); try { await this.workspace.resolve(relative); found.push({name:symbol.name,file:relative,line:symbol.location.range.start.line+1}); } catch { /* excluded */ } }
          result = {symbols:found.slice(0,30)}; break;
        }
      }
      signal.throwIfAborted();
      const safe=redactOutput(result);result=safe.value;
      const checked=outputSchemas[name].safeParse(result);
      if(!checked.success) throw new Error('Tool result did not match its output schema.');
      const rejected=!!result && typeof result==='object' && ((('applied' in result) && result.applied===false) || (('approved' in result) && result.approved===false));
      const approval=rejected?'rejected':context.approval;
      try { await this.recordAudit(context,rejected?'rejected':'succeeded',approval,summarizeResult(result)); }
      catch { this.log(name,'completed, but its audit event could not be saved'); return checked.data; }
      this.log(name,safe.count ? `completed; redacted ${safe.count} detected value(s)` : rejected?'rejected':'completed'); return checked.data;
    } catch(error) {
      this.log(name,'failed');
      try { await this.recordAudit(context,'failed',context.approval,'',error instanceof Error ? error.message : 'Tool failed.'); }
      catch { this.log(name,'failed; audit event could not be saved'); }
      throw error;
    } finally { if(this.auditContext===context) this.auditContext=undefined; }
  }
  async revertLastChange(signal:AbortSignal):Promise<unknown> {
    const context:AuditContext={taskId:randomUUID(),tool:'revert',argsSummary:'{}',approval:'pending'};
    this.auditContext=context;this.log('revert','running');
    try {
      await this.recordAudit(context,'started','pending','');
      const result=await this.editor.revert(signal);
      const rejected=!!result && typeof result==='object' && 'applied' in result && result.applied===false;
      try { await this.recordAudit(context,rejected?'rejected':'succeeded',rejected?'rejected':context.approval,summarizeResult(result)); }
      catch { this.log('revert','completed, but its audit event could not be saved');return result; }
      this.log('revert',rejected?'rejected':'completed');return result;
    } catch(error) {
      this.log('revert','failed');
      try { await this.recordAudit(context,'failed',context.approval,'',error instanceof Error ? error.message : 'Revert failed.'); }
      catch { this.log('revert','failed; audit event could not be saved'); }
      throw error;
    } finally { if(this.auditContext===context) this.auditContext=undefined; }
  }
  dispose(): void { this.editor.dispose(); }
}
