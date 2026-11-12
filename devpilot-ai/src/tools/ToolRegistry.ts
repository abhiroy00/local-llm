import * as vscode from 'vscode';
import { WorkspaceService } from '../services/WorkspaceService';
import { FileEditor, fingerprint } from './FileEditor';
import { approvedTerminal } from './Terminal';
import { SemanticIndex } from '../indexing/SemanticIndex';
import { OllamaService } from '../services/OllamaService';
import type { ApprovalFunction } from '../security/ApprovalService';

import { schemas, outputSchemas, writeTools, toolCatalog, type ToolName } from './ToolSchemas';
export type { ToolName } from './ToolSchemas';
export class ToolRegistry implements vscode.Disposable {
  readonly editor: FileEditor;
  private semantic?: SemanticIndex;
  constructor(readonly workspace: WorkspaceService, private readonly log:(name:string,status:string)=>void,private readonly approve?:ApprovalFunction) { this.editor = new FileEditor(workspace,approve); }
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
        case 'search_semantic': {
          const config=vscode.workspace.getConfiguration('devpilot');const model=config.get<string>('embeddingModel','');
          if(!model) throw new Error('Semantic search is disabled. Configure an installed Embedding Model, or use search_code.');
          this.semantic ??= new SemanticIndex(this.workspace,new OllamaService(config.get<string>('ollamaEndpoint','http://localhost:11434')),model);
          result=await this.semantic.search(data.query as string,signal); break;
        }
        case 'list_files': result = await this.workspace.files(signal); break;
        case 'read_file': { const content = await this.workspace.read(data.path as string); result = {path:data.path,hash:fingerprint(content),content:content.slice(0,12000),truncated:content.length>12000}; break; }
        case 'search_code': case 'search_files': result = await this.workspace.search(data.query as string,name === 'search_files',signal); break;
        case 'create_file': { try { await this.workspace.read(data.path as string); throw new Error('File already exists; use edit_file.'); } catch(error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } result = await this.editor.change(data.path as string,data.content as string,undefined,signal); break; }
        case 'edit_file': result = await this.editor.change(data.path as string,data.content as string,data.hash as string,signal); break;
        case 'apply_patch': result = await this.editor.patch(data.path as string,data.patch as string,data.hash as string,signal); break;
        case 'delete_file': result = await this.editor.change(data.path as string,undefined,data.hash as string,signal); break;
        case 'run_terminal': result = await approvedTerminal(this.workspace.root,data.executable as string,data.args as string[],signal,this.approve,this.workspace); break;
        case 'run_tests': result = await approvedTerminal(this.workspace.root,data.runner === 'npm' ? 'npm' : 'python',data.runner === 'npm' ? ['test'] : ['-m','pytest'],signal,this.approve,this.workspace); break;
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
      this.log(name,'completed'); return checked.data;
    } catch(error) { this.log(name,'failed'); throw error; }
  }
  dispose(): void { this.editor.dispose(); }
}
