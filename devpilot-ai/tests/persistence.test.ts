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

it('redacts conversation secrets and omits secret-bearing undo backups',async()=>{
  await withStore(async(_storage,store)=>{
    const workspace='workspace';
    await store.saveConversation(workspace,'safe-session',[{role:'user',content:'password="fixture-secret-value"'}]);
    expect((await store.getConversation(workspace,'safe-session'))?.[0].content).toContain('[REDACTED:password]');
    const skipped=await store.saveUndoRecords(workspace,[{path:'config.ts',before:'password="fixture-secret-value"',after:'safe'}]);
    expect(skipped).toBe(1);
    expect(await store.loadUndoRecords(workspace)).toEqual([]);
    expect(await fs.readFile(join(_storage,'devpilot-state.json'),'utf8')).not.toContain('fixture-secret-value');
  });
});

it('redacts legacy persisted secrets and reports removed undo records',async()=>{
  const storage=await fs.mkdtemp(join(tmpdir(),'devpilot-state-'));
  try {
    const secret='fixture-secret-value';
    await fs.writeFile(join(storage,'devpilot-state.json'),JSON.stringify({
      version:1,
      conversations:[{id:'legacy',workspace:'workspace',title:`password="${secret}"`,createdAt:1,updatedAt:1,messages:[{role:'user',content:`password="${secret}"`}]}],
      indexes:{},
      undo:{workspace:[{path:'config.ts',before:`token="${secret}"`,after:'safe'}]},
    }));
    const store=await PersistenceService.open(storage);
    expect(store.warnings).toHaveLength(2);
    expect((await store.getConversation('workspace','legacy'))?.[0].content).not.toContain(secret);
    expect(await store.loadUndoRecords('workspace')).toEqual([]);
    expect(await fs.readFile(join(storage,'devpilot-state.json'),'utf8')).not.toContain(secret);
  } finally { await fs.rm(storage,{recursive:true,force:true}); }
});

it('redacts audit details, survives reopen, and can be cleared',async()=>{
  await withStore(async(storage,store)=>{
    await store.appendAuditEvent({taskId:'task-1',tool:'run_terminal',argsSummary:'password="fixture-secret-value"',approval:'approved',outcome:'failed',resultSummary:'',detail:'token="fixture-secret-value"'});
    const reopened=await PersistenceService.open(storage);
    const events=await reopened.listAuditEvents();
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('fixture-secret-value');
    await reopened.clearAuditLog();
    expect(await reopened.listAuditEvents()).toEqual([]);
  });
});

it('retains only the 1000 newest audit events',async()=>{
  const storage=await fs.mkdtemp(join(tmpdir(),'devpilot-state-'));
  try {
    const auditEvents=Array.from({length:1000},(_,index)=>({id:`event-${index}`,taskId:'task',timestamp:index,tool:'read_file',argsSummary:'{}',approval:'not_required',outcome:'succeeded',resultSummary:''}));
    await fs.writeFile(join(storage,'devpilot-state.json'),JSON.stringify({version:2,conversations:[],indexes:{},undo:{},auditEvents}));
    const store=await PersistenceService.open(storage);
    await store.appendAuditEvent({taskId:'next-task',tool:'list_files',argsSummary:'{}',approval:'not_required',outcome:'succeeded',resultSummary:''});
    const events=await store.listAuditEvents();
    expect(events).toHaveLength(1000);
    expect(events[0].id).toBe('event-1');
    expect(events.at(-1)?.taskId).toBe('next-task');
  } finally { await fs.rm(storage,{recursive:true,force:true}); }
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
