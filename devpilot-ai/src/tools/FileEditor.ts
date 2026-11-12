import * as vscode from 'vscode';
import { createHash, randomUUID } from 'node:crypto';
import { createTwoFilesPatch, applyPatch, parsePatch } from 'diff';
import { promises as fs } from 'node:fs';
import { WorkspaceService } from '../services/WorkspaceService';
import type { ApprovalFunction } from '../security/ApprovalService';

export const fingerprint = (text: string): string => createHash('sha256').update(text).digest('hex');
export class FileEditor implements vscode.Disposable {
  private previews = new Map<string,string>();
  private backups: {path:string;before:string | undefined;after:string | undefined}[] = [];
  private registration = vscode.workspace.registerTextDocumentContentProvider('devpilot-preview',{provideTextDocumentContent: uri => this.previews.get(uri.toString()) ?? ''});
  constructor(private readonly workspace: WorkspaceService,private readonly approve?:ApprovalFunction) {}
  async change(file: string, content: string | undefined, expectedHash: string | undefined, signal: AbortSignal,recordBackup=true): Promise<unknown> {
    if (!vscode.workspace.isTrusted) throw new Error('Workspace trust required.');
    signal.throwIfAborted();
    const target = await this.workspace.resolve(file,true); const uri = vscode.Uri.file(target);
    const hasDirtyEditor=()=>vscode.workspace.textDocuments.some(document=>document.uri.toString()===uri.toString() && document.isDirty);
    if(hasDirtyEditor()) throw new Error('Save your unsaved changes before approving an agent edit.');
    let before: string | undefined;
    try { await fs.lstat(target); before = await this.workspace.read(file); }
    catch(error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (before !== undefined && (!expectedHash || fingerprint(before) !== expectedHash)) throw new Error('Read this file first and provide its current hash. File may have changed.');
    if (before === undefined && content === undefined) throw new Error('File does not exist.');
    if (content !== undefined && Buffer.byteLength(content.replace(/\r?\n/g,'\r\n')) > 128*1024) throw new Error('Proposed file exceeds 128 KiB with Windows line endings.');
    const document = before === undefined ? undefined : await vscode.workspace.openTextDocument(uri);
    if (document?.isDirty) throw new Error('Save your unsaved changes before approving an agent edit.');
    const version = document?.version;
    const left = vscode.Uri.parse(`devpilot-preview:/${randomUUID()}/before/${file}`); const right = vscode.Uri.parse(`devpilot-preview:/${randomUUID()}/after/${file}`);
    this.previews.set(left.toString(),before ?? ''); this.previews.set(right.toString(),content ?? '');
    try {
      await vscode.commands.executeCommand('vscode.diff',left,right,`DevPilot: ${file} (${content === undefined ? 'delete' : before === undefined ? 'create' : 'edit'})`,{preview:true});
      const title=`DevPilot proposes ${content === undefined ? 'deleting' : before === undefined ? 'creating' : 'editing'} ${file}. Review the open diff before applying.`;
      const approved=this.approve ? await this.approve(title,'Apply change',signal) : (await vscode.window.showWarningMessage(title,{modal:false},'Apply change'))==='Apply change';
      signal.throwIfAborted();
      if (!approved) return {applied:false,reason:'User rejected the change.'};
      if(await this.workspace.resolve(file,true)!==target) throw new Error('Workspace path changed while reviewing.');
      if (!vscode.workspace.isTrusted) throw new Error('Workspace trust required.');
      if(hasDirtyEditor()) throw new Error('File changed while reviewing. Save your unsaved changes first.');
      if (document && (document.isDirty || document.version !== version || await this.workspace.read(file) !== before)) throw new Error('File changed while reviewing. Read it again and propose a new diff.');
      if (!document) { try { await fs.stat(target); throw new Error('File was created while reviewing.'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; } }
      const edit = new vscode.WorkspaceEdit();
      if (content === undefined) edit.deleteFile(uri,{ignoreIfNotExists:false});
      else if (document) edit.replace(uri,new vscode.Range(document.positionAt(0),document.positionAt(document.getText().length)),content);
      else { edit.createFile(uri,{overwrite:false}); edit.insert(uri,new vscode.Position(0,0),content); }
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('VS Code could not apply the change.');
      if (content !== undefined) { const changed = await vscode.workspace.openTextDocument(uri); if (!await changed.save()) throw new Error('Change applied in editor but saving failed; inspect the file.'); }
      const after=content === undefined ? undefined : await this.workspace.read(file);
      if(recordBackup) { this.backups.push({path:file,before,after}); this.backups = this.backups.slice(-20); }
      return {applied:true,file,hash:after === undefined ? undefined : fingerprint(after),diff:createTwoFilesPatch(file,file,before ?? '',after ?? '').slice(0,8000)};
    } finally { this.previews.delete(left.toString()); this.previews.delete(right.toString()); }
  }
  async patch(file: string, patch: string, expectedHash: string, signal: AbortSignal): Promise<unknown> {
    const patches = parsePatch(patch);
    if (patches.length !== 1) throw new Error('Exactly one file patch is supported.');
    for (const name of [patches[0].oldFileName,patches[0].newFileName]) if (name !== file && name !== 'a/'+file && name !== 'b/'+file) throw new Error('Patch path must match the requested file.');
    const before = await this.workspace.read(file);
    const after = applyPatch(before,patch,{fuzzFactor:0}); if (after === false) throw new Error('Patch does not match the current file.');
    return this.change(file,after,expectedHash,signal);
  }
  async revert(signal: AbortSignal): Promise<unknown> {
    const backup = this.backups.at(-1); if (!backup) throw new Error('No session changes to revert.');
    const result = await this.change(backup.path,backup.before,backup.after === undefined ? undefined : fingerprint(backup.after),signal,false);
    if(result && typeof result === 'object' && 'applied' in result && result.applied === true) this.backups.pop();
    return result;
  }
  dispose(): void { this.registration.dispose(); this.previews.clear(); this.backups = []; }
}
