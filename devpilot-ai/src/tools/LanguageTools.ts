import * as vscode from 'vscode';
import path from 'node:path';
import { WorkspaceService } from '../services/WorkspaceService';

interface SourceLocation {file:string;line:number;column:number}
/** Providers may return external libraries and ignored files; validate every returned location. */
export async function allowedLocation(workspace:WorkspaceService,uri:vscode.Uri,range:vscode.Range):Promise<SourceLocation | undefined> {
  if(uri.scheme!=='file') return;
  const file=path.relative(workspace.root,uri.fsPath).replace(/\\/g,'/');
  try {await workspace.read(file);return {file,line:range.start.line+1,column:range.start.character+1};} catch {return;}
}
export async function documentSymbols(workspace:WorkspaceService,file:string,signal:AbortSignal):Promise<unknown> {
  await workspace.read(file);const uri=vscode.Uri.file(await workspace.resolve(file));
  const provided=await vscode.commands.executeCommand<(vscode.DocumentSymbol|vscode.SymbolInformation)[]>('vscode.executeDocumentSymbolProvider',uri);
  signal.throwIfAborted();
  const symbols:{name:string;kind:number;line:number;endLine:number}[]=[];
  const visit=async(items:(vscode.DocumentSymbol|vscode.SymbolInformation)[],depth:number):Promise<void>=>{
    for(const item of items) {
      signal.throwIfAborted();if(symbols.length>=100 || depth>8) return;
      const range='location' in item ? item.location.range : item.range;
      if('location' in item && !await allowedLocation(workspace,item.location.uri,range)) continue;
      symbols.push({name:item.name.slice(0,200),kind:item.kind,line:range.start.line+1,endLine:range.end.line+1});
      if('children' in item) await visit(item.children,depth+1);
    }
  };
  await visit(provided ?? [],0);
  return {symbols,truncated:symbols.length>=100,note:'Symbols depend on installed VS Code language providers.'};
}
export async function navigateCode(workspace:WorkspaceService,file:string,line:number,column:number,references:boolean,signal:AbortSignal):Promise<unknown> {
  await workspace.read(file);const uri=vscode.Uri.file(await workspace.resolve(file));
  const document=await vscode.workspace.openTextDocument(uri);const lines=document.getText().split(/\r?\n/);
  if(line>lines.length || column>lines[line-1].length+1) throw new Error('Position is outside the document. Lines and columns are 1-based.');
  const command=references?'vscode.executeReferenceProvider':'vscode.executeDefinitionProvider';
  const provided=await vscode.commands.executeCommand<(vscode.Location|vscode.LocationLink)[]>(command,uri,new vscode.Position(line-1,column-1));
  signal.throwIfAborted();const locations:SourceLocation[]=[];
  for(const item of (provided ?? []).slice(0,200)) {
    signal.throwIfAborted();
    const found=await allowedLocation(workspace,'targetUri' in item ? item.targetUri : item.uri,'targetUri' in item ? (item.targetSelectionRange ?? item.targetRange) : item.range);
    if(found) locations.push(found);
    if(locations.length>=30) break;
  }
  return {locations,truncated:(provided?.length ?? 0)>200 || locations.length>=30,note:'Results depend on installed language providers; external and excluded files are omitted.'};
}
