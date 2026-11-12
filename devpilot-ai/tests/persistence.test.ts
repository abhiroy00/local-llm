import { expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersistenceService, workspaceKey } from '../src/services/PersistenceService';

async function withStore(test:(storage:string,store:PersistenceService)=>Promise<void>):Promise<void> {
  const storage=await fs.mkdtemp(join(tmpdir(),'devpilot-state-'));
  try { await test(storage,await PersistenceService.open(storage)); }
  finally { await fs.rm(storage,{recursive:true,force:true}); }
}

it('persists conversations, semantic entries, and undo records across reopen',async()=>{
  await withStore(async(storage,store)=>{
    const workspace=workspaceKey('C:\\Projects\\Example');
    await store.saveConversation(workspace,'conversation-1',[{role:'user',content:'Fix a bug.'},{role:'assistant',content:'Done.'}]);
    await store.saveSemanticIndex(workspace,'embed-model',[{file:'src/a.ts',hash:'abc',vector:[0.1,0.2]}]);
    await store.saveUndoRecords(workspace,[{path:'src/a.ts',before:'old',after:'new'}]);

    const reopened=await PersistenceService.open(storage);
    expect(await reopened.listConversations(workspace)).toHaveLength(1);
    expect(await reopened.getConversation(workspace,'conversation-1')).toEqual([
      {role:'user',content:'Fix a bug.'},{role:'assistant',content:'Done.'},
    ]);
    expect(await reopened.loadSemanticIndex(workspace,'embed-model')).toEqual([{file:'src/a.ts',hash:'abc',vector:[0.1,0.2]}]);
    expect(await reopened.loadUndoRecords(workspace)).toEqual([{path:'src/a.ts',before:'old',after:'new'}]);
    expect(await reopened.listConversations(workspaceKey('C:\\Projects\\Other'))).toEqual([]);
    expect(await reopened.loadSemanticIndex(workspace,'different-model')).toEqual([]);
  });
});

it('keeps only the 100 most recently updated conversations per workspace',async()=>{
  await withStore(async(_storage,store)=>{
    const workspace='workspace';
    for(let i=0;i<101;i++) await store.saveConversation(workspace,`session-${i}`,[{role:'user',content:`Task ${i}`}]);
    const conversations=await store.listConversations(workspace);
    expect(conversations).toHaveLength(100);
    expect(conversations.map(item=>item.id)).toContain('session-100');
    expect(conversations.map(item=>item.id)).not.toContain('session-0');
  });
});

it('rejects invalid stored data instead of silently discarding it',async()=>{
  const storage=await fs.mkdtemp(join(tmpdir(),'devpilot-state-'));
  try {
    await fs.writeFile(join(storage,'devpilot-state.json'),'{"version":2}');
    await expect(PersistenceService.open(storage)).rejects.toThrow('format is invalid or unsupported');
  } finally { await fs.rm(storage,{recursive:true,force:true}); }
});
