import {BackgroundService} from '../services/BackgroundService';
import * as vscode from 'vscode';
import { WorkspaceService } from '../services/WorkspaceService';
import { FileEditor, fingerprint } from './FileEditor';
import { approvedTerminal } from './Terminal';
import { documentSymbols, navigateCode } from './LanguageTools';
import { SemanticIndex } from '../indexing/SemanticIndex';
import { OllamaService } from '../services/OllamaService';
import { PersistenceService, workspaceKey } from '../services/PersistenceService';
import type { ApprovalFunction } from '../security/ApprovalService';

import { schemas, outputSchemas, writeTools, toolCatalog, type ToolName } from './ToolSchemas';
export type { ToolName } from './ToolSchemas';
export class ToolRegistry implements vscode.Disposable {
  readonly editor: FileEditor;
  readonly background:BackgroundService;
  private semantic?: SemanticIndex;
  constructor(readonly workspace: WorkspaceService, private readonly log:(name:string,status:string,detail?:string)=>void,private readonly approve?:ApprovalFunction,private readonly persistence?:PersistenceService,private readonly onPlan?:(steps:{title:string;status:'pending'|'in_progress'|'completed'}[])=>void,private readonly onWorkspaceChange?:()=>void) { this.background=new BackgroundService(workspace.root,approve,()=>this.onWorkspaceChange?.());this.editor = new FileEditor(workspace,approve,persistence,workspaceKey(workspace.root)); }
  async guidance(paths:string[]):Promise<Record<string,{content:string;complete:boolean}>> {
    const cache=new Map<string,string|undefined>();const result:Record<string,{content:string;complete:boolean}>={};
    for(const file of paths.slice(0,4)) {
      const segments=file.split('/');const candidates=['AGENTS.md',...segments.slice(0,-1).map((_,index)=>segments.slice(0,index+1).join('/')+'/AGENTS.md')];
      let content='';let complete=true;
      if(candidates.length>12) {result[file]={content:'',complete:false};continue;}
      for(const candidate of candidates) {
        if(!cache.has(candidate)) {try {cache.set(candidate,await this.workspace.read(candidate));} catch(error) {if((error as NodeJS.ErrnoException).code==='ENOENT') cache.set(candidate,undefined);else {complete=false;break;}}}
        const text=cache.get(candidate);if(text!==undefined) {if(content.length+text.length+candidate.length>2000) {complete=false;break;}content+=candidate+':\n'+text+'\n';}
      }
      result[file]={content,complete};
    }
    return result;
  }
  catalog(mode:'plan'|'agent'): unknown {
    return toolCatalog(mode);
  }
  async execute(name: ToolName,input: unknown,mode:'plan'|'agent',signal:AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    if (!vscode.workspace.isTrusted) throw new Error('Open a trusted local workspace before using tools.');
    if (!Object.hasOwn(schemas,name)) throw new Error('Unknown tool.');
    if (mode === 'plan' && writeTools.has(name)) throw new Error('Plan mode cannot modify files or execute commands.');
    const parsed = schemas[name].safeParse(input); if (!parsed.success) throw new Error('Tool arguments do not match the input schema.');
    this.log(name,'running');
    try {
      const data = parsed.data as Record<string, unknown>;
      let result: unknown;
      switch(name) {
        case 'start_process': result=await this.background.start(data.script as 'dev'|'start',signal);break;
        case 'read_process': result=this.background.read(data.id as string);break;
        case 'stop_process': result=await this.background.stop(data.id as string);break;
        case 'document_symbols': result=await documentSymbols(this.workspace,data.path as string,signal);break;
        case 'find_references': case 'go_to_definition': result=await navigateCode(this.workspace,data.path as string,data.line as number,data.column as number,name==='find_references',signal);break;
        case 'search_semantic': {
          const config=vscode.workspace.getConfiguration('devpilot');const model=config.get<string>('embeddingModel','');
          if(!model) throw new Error('Semantic search is disabled. Configure an installed Embedding Model, or use search_code.');
          this.semantic ??= new SemanticIndex(this.workspace,new OllamaService(config.get<string>('ollamaEndpoint','http://localhost:11434')),model,this.persistence,workspaceKey(this.workspace.root));
          result=await this.semantic.search(data.query as string,signal); break;
        }
        case 'list_files': result = await this.workspace.files(signal); break;
        case 'read_file': {
          const content = await this.workspace.read(data.path as string);
          const lines=content.split('\n'); const start=(data.startLine as number | undefined) ?? 1;
          const end=Math.min((data.endLine as number | undefined) ?? lines.length,lines.length);
          if(start>end) throw new Error('Invalid line range. Use 1-based lines within the file.');
          const excerpt=lines.slice(start-1,end).join('\n'); const clipped=excerpt.slice(0,12000);
          result={path:data.path,hash:fingerprint(content),content:clipped,startLine:start,endLine:start+clipped.split('\n').length-1,totalLines:lines.length,truncated:start>1 || end<lines.length || excerpt.length>12000}; break;
        }
        case 'replace_text': {
          const before=await this.workspace.read(data.path as string); const old=data.oldText as string;
          const index=before.indexOf(old);
          if(index<0 || before.indexOf(old,index+1)>=0) throw new Error('oldText must match exactly once. Read the file and include more surrounding context.');
          const after=before.slice(0,index)+(data.newText as string)+before.slice(index+old.length);
          result=await this.editor.change(data.path as string,after,data.hash as string,signal); break;
        }
        case 'update_plan': {
          const steps=schemas.update_plan.parse(input).steps; this.onPlan?.(steps); result={steps}; break;
        }
        case 'get_diagnostics': {
          const diagnostics:{file:string;line:number;column:number;severity:string;message:string;source?:string}[]=[];
          let truncated=false;
          const requested=data.path as string | undefined;
          if(requested) await this.workspace.read(requested);
          for(const [uri,items] of vscode.languages.getDiagnostics()) {
            if(uri.scheme!=='file') continue;
            const relative=vscode.workspace.asRelativePath(uri,false).replace(/\\/g,'/');
            if(requested && relative!==requested) continue;
            try { if(await this.workspace.resolve(relative)!==uri.fsPath) continue; } catch { continue; }
            for(const item of items) {
              if(diagnostics.length>=100) {truncated=true;break;}
              diagnostics.push({file:relative,line:item.range.start.line+1,column:item.range.start.character+1,severity:['error','warning','information','hint'][item.severity] ?? 'unknown',message:item.message.slice(0,2000),source:item.source});
            }
          }
          result={diagnostics,truncated}; break;
        }
        case 'search_code': case 'search_files': result = await this.workspace.search(data.query as string,name === 'search_files',signal); break;
        case 'create_file': { try { await this.workspace.read(data.path as string); throw new Error('File already exists; use edit_file.'); } catch(error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } result = await this.editor.change(data.path as string,data.content as string,undefined,signal); break; }
        case 'edit_file': result = await this.editor.change(data.path as string,data.content as string,data.hash as string,signal); break;
        case 'apply_patch': result = await this.editor.patch(data.path as string,data.patch as string,data.hash as string,signal); break;
        case 'delete_file': result = await this.editor.change(data.path as string,undefined,data.hash as string,signal); break;
        case 'run_terminal': result = await approvedTerminal(this.workspace.root,data.executable as string,data.args as string[],signal,this.approve,this.workspace); break;
        case 'run_tests': {
          const runner=data.runner as string; const executable=runner==='pytest' ? 'python' : runner;
          const args=['pytest','python3'].includes(runner) ? ['-m','pytest'] : runner==='go' ? ['test','./...'] : ['test'];
          result=await approvedTerminal(this.workspace.root,executable,args,signal,this.approve,this.workspace); break;
        }
        case 'git_status': case 'git_diff': result = await approvedTerminal(this.workspace.root,'git',[name === 'git_status' ? 'status' : 'diff'],signal,this.approve,this.workspace); break;
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
      const checked=outputSchemas[name].safeParse(result);
      if(!checked.success) throw new Error('Tool result did not match its output schema.');
      const detail=typeof result==='object' && result!==null ? ('output' in result ? String(result.output).slice(0,4000) : 'diff' in result ? String(result.diff).slice(0,4000) : undefined) : undefined;
      this.log(name,'completed',detail); return checked.data;
    } catch(error) { this.log(name,'failed',error instanceof Error ? error.message : 'Tool failed'); throw error; }
  }
  dispose(): void { this.background.dispose();this.editor.dispose(); }
}
