import { vi } from 'vitest';
export const workspace = {
  isTrusted:true,
  textDocuments:[] as {uri:{toString():string};isDirty:boolean}[],
  registerTextDocumentContentProvider:vi.fn(()=>({dispose:vi.fn()})),
  openTextDocument:vi.fn(),
  applyEdit:vi.fn(async(edit?:unknown)=>{void edit;return true;}),
};
export const window = {showWarningMessage:vi.fn(),showInformationMessage:vi.fn()};
export const commands = {executeCommand:vi.fn(async()=>undefined)};
export const Uri = {file:(fsPath:string)=>({fsPath,path:fsPath,toString:()=>fsPath}),parse:(text:string)=>({toString:()=>text})};
export class Position { constructor(readonly line:number,readonly character:number) {} }
export class Range { constructor(readonly start:Position,readonly end:Position) {} }
export class WorkspaceEdit {
  changes:unknown[]=[];
  replace(...args:unknown[]):void { this.changes.push(['replace',...args]); }
  deleteFile(...args:unknown[]):void { this.changes.push(['delete',...args]); }
  createFile(...args:unknown[]):void { this.changes.push(['create',...args]); }
  insert(...args:unknown[]):void { this.changes.push(['insert',...args]); }
}

export const languages={getDiagnostics:vi.fn(()=>[])};
