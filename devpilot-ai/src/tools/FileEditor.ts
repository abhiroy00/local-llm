import type {CheckpointSummary} from '../types/workspace';
import * as vscode from 'vscode';
import { createHash, randomUUID } from 'node:crypto';
import { createTwoFilesPatch, applyPatch, parsePatch } from 'diff';
import { promises as fs } from 'node:fs';
import { WorkspaceService } from '../services/WorkspaceService';
import { PersistenceService, type UndoRecord } from '../services/PersistenceService';
import type { ApprovalFunction } from '../security/ApprovalService';

export const fingerprint = (text: string): string => createHash('sha256').update(text).digest('hex');
export class FileEditor implements vscode.Disposable {
  private previews = new Map<string,string>();
  private backups: UndoRecord[] = [];
  private backupsLoaded=false;
  private currentTask?:{id:string;title:string;createdAt:number};
  beginTask(id:string,title:string):void {if(!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid task id.');this.currentTask={id,title:title.slice(0,160),createdAt:Date.now()};}
  endTask():void {this.currentTask=undefined;}
  async checkpoints():Promise<CheckpointSummary[]> {
    await this.loadBackups();const groups=new Map<string,{id:string;title:string;createdAt:number;files:string[];records:number}>();
    for(const record of this.backups) {
      if(!record.taskId) continue;
      const group=groups.get(record.taskId) ?? {id:record.taskId,title:record.taskTitle ?? 'Coding task',createdAt:record.createdAt ?? 0,files:[],records:0};
      if(!group.files.includes(record.path)) group.files.push(record.path);group.records++;groups.set(record.taskId,group);
    }
    return [...groups.values()].reverse().map(group=>({...group,canRevert:this.backups.at(-1)?.taskId===group.id}));
  }
  async previewCheckpoint(taskId:string,file:string):Promise<void> {
    await this.loadBackups();const records=this.backups.filter(record=>record.taskId===taskId && record.path===file);
    if(!records.length) throw new Error('This change checkpoint is no longer retained.');await this.workspace.resolve(file,true);
    const left=vscode.Uri.parse(`devpilot-preview:/${randomUUID()}/checkpoint-before/${file}`);const right=vscode.Uri.parse(`devpilot-preview:/${randomUUID()}/checkpoint-after/${file}`);
    this.previews.set(left.toString(),records[0].before ?? '');this.previews.set(right.toString(),records.at(-1)!.after ?? '');
    while(this.previews.size>40) this.previews.delete(this.previews.keys().next().value!);
    await vscode.commands.executeCommand('vscode.diff',left,right,`DevPilot task changes: ${file}`,{preview:true});
  }
  async revertTask(taskId:string,signal:AbortSignal):Promise<{reverted:number;remaining:number;stopped:boolean}> {
    await this.loadBackups();signal.throwIfAborted();
    if(this.backups.at(-1)?.taskId!==taskId) throw new Error('Undo newer changes first. Only the latest retained task can be reverted.');
    const records=this.backups.filter(record=>record.taskId===taskId);const latest=new Map<string,UndoRecord>();for(const record of records) latest.set(record.path,record);
    // Preflight every final file state before reverting the first file. Review-time checks still apply.
    for(const record of latest.values()) {
      signal.throwIfAborted();const target=await this.workspace.resolve(record.path,true);const uri=vscode.Uri.file(target);
      if(vscode.workspace.textDocuments.some(doc=>doc.uri.toString()===uri.toString() && doc.isDirty)) throw new Error('Save unsaved changes before reverting this task.');
      let current:string|undefined;try {current=await this.workspace.read(record.path);} catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;}
      if(current!==record.after) throw new Error(`Task checkpoint is stale: ${record.path} changed. No task changes were reverted.`);
    }
    let reverted=0;
    while(this.backups.at(-1)?.taskId===taskId) {
      const result=await this.revert(signal) as {applied?:boolean};if(!result.applied) return {reverted,remaining:this.backups.filter(record=>record.taskId===taskId).length,stopped:true};reverted++;
    }
    return {reverted,remaining:0,stopped:false};
  }
  private registration = vscode.workspace.registerTextDocumentContentProvider('devpilot-preview',{provideTextDocumentContent: uri => this.previews.get(uri.toString()) ?? ''});
  constructor(private readonly workspace: WorkspaceService,private readonly approve?:ApprovalFunction,private readonly persistence?:PersistenceService,private readonly workspaceId='') {}
  private async loadBackups():Promise<void> {
    if(this.backupsLoaded) return;
    if(this.persistence) this.backups=await this.persistence.loadUndoRecords(this.workspaceId);
    this.backupsLoaded=true;
  }
  private async saveBackups():Promise<void> {
    if(this.persistence) await this.persistence.saveUndoRecords(this.workspaceId,this.backups);
  }
  async change(file: string, content: string | undefined, expectedHash: string | undefined, signal: AbortSignal,recordBackup=true): Promise<unknown> {
    if (!vscode.workspace.isTrusted) throw new Error('Workspace trust required.');
    if(recordBackup) {await this.loadBackups();if(this.currentTask && this.backups.filter(record=>record.taskId===this.currentTask!.id).length>=20) throw new Error('Task change limit reached (20 retained edits). Finish or split the task before editing more files.');}
    signal.throwIfAborted();
    const target = await this.workspace.resolve(file,true); const uri = vscode.Uri.file(target);
    const hasDirtyEditor=()=>vscode.workspace.textDocuments.some(document=>document.uri.toString()===uri.toString() && document.isDirty);
    if(hasDirtyEditor()) throw new Error('Save your unsaved changes before approving an agent edit.');
    let before: string | undefined;
    try { await fs.lstat(target); before = await this.workspace.read(file); }
    catch(error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (before !== undefined && (!expectedHash || fingerprint(before) !== expectedHash)) throw new Error('Read this file first and provide its current hash. File may have changed.');
    if (before === undefined && content === undefined) throw new Error('File does not exist.');
    if(content!==undefined && [...content].some(character=>character.charCodeAt(0)<32 && !['\t','\n','\r'].includes(character))) throw new Error('Proposed file contains raw control characters. Use escaped source text instead.');
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
      if(recordBackup) {
        this.backups.push({path:file,before,after,...(this.currentTask?{taskId:this.currentTask.id,taskTitle:this.currentTask.title,createdAt:this.currentTask.createdAt}:{})});
        while(this.backups.length>20) {
          const oldest=this.backups[0].taskId;
          if(oldest) this.backups=this.backups.filter(record=>record.taskId!==oldest);else this.backups.shift();
        }
        try { await this.saveBackups(); }
        catch(error) { throw new Error(`Change applied to ${file}, but its undo record could not be saved: ${error instanceof Error ? error.message : 'Storage failed.'}`); }
      }
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
    await this.loadBackups();
    const backup = this.backups.at(-1); if (!backup) throw new Error('No session changes to revert.');
    const result = await this.change(backup.path,backup.before,backup.after === undefined ? undefined : fingerprint(backup.after),signal,false);
    if(result && typeof result === 'object' && 'applied' in result && result.applied === true) {
      this.backups.pop();
      try { await this.saveBackups(); }
      catch(error) { throw new Error(`Change reverted, but its undo record could not be cleared: ${error instanceof Error ? error.message : 'Storage failed.'}`); }
    }
    return result;
  }
  dispose(): void { this.registration.dispose(); this.previews.clear(); this.backups = []; }
}
