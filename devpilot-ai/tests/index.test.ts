import { expect,it,vi } from 'vitest';
import { cosine,SemanticIndex } from '../src/indexing/SemanticIndex';
import { OllamaService } from '../src/services/OllamaService';
import { WorkspaceService } from '../src/services/WorkspaceService';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersistenceService } from '../src/services/PersistenceService';
it('ranks similar vectors and rejects dimension changes',()=>{
  expect(cosine([1,0],[1,0])).toBe(1);expect(cosine([1,0],[0,1])).toBe(0);expect(()=>cosine([1],[1,2])).toThrow();
});
it('indexes allowed text and excludes entries changed after indexing',async()=>{
  const ws=new WorkspaceService('unused');vi.spyOn(ws,'files').mockResolvedValue({files:['a.ts','b.ts'],truncated:false});
  const read=vi.spyOn(ws,'read').mockImplementation(async file=>file==='a.ts'?'alpha':'beta');
  const ollama=new OllamaService('http://localhost:11434');vi.spyOn(ollama,'models').mockResolvedValue(['embed']);vi.spyOn(ollama,'embed').mockResolvedValueOnce([[1,0],[0,1]]).mockResolvedValueOnce([[1,0]]);
  const index=new SemanticIndex(ws,ollama,'embed');expect(await index.build(new AbortController().signal)).toMatchObject({indexed:2});
  read.mockImplementation(async file=>file==='a.ts'?'changed':'beta');
  expect(await index.search('alpha',new AbortController().signal)).toMatchObject({matches:[{file:'b.ts',score:0}]});
});
it('reuses persisted vectors after recreating the semantic index',async()=>{
  const storage=await fs.mkdtemp(join(tmpdir(),'devpilot-index-'));
  try {
    const ws=new WorkspaceService('unused');const files=vi.spyOn(ws,'files').mockResolvedValue({files:['a.ts'],truncated:false});
    vi.spyOn(ws,'read').mockResolvedValue('alpha');
    const ollama=new OllamaService('http://localhost:11434');
    vi.spyOn(ollama,'models').mockResolvedValue(['embed']);vi.spyOn(ollama,'embed').mockResolvedValue([[1,0]]);
    const first=new SemanticIndex(ws,ollama,'embed',await PersistenceService.open(storage),'workspace');
    await first.build(new AbortController().signal);
    const restored=new SemanticIndex(ws,ollama,'embed',await PersistenceService.open(storage),'workspace');
    expect(await restored.search('alpha',new AbortController().signal)).toMatchObject({matches:[{file:'a.ts',score:1}]});
    expect(files).toHaveBeenCalledTimes(1);
    expect(ollama.models).toHaveBeenCalledTimes(1);
    expect(ollama.embed).toHaveBeenCalledTimes(2);
  } finally { await fs.rm(storage,{recursive:true,force:true}); }
});
it('skips credential-bearing files before embedding',async()=>{
  const ws=new WorkspaceService('unused');vi.spyOn(ws,'files').mockResolvedValue({files:['safe.ts','config.ts'],truncated:false});
  vi.spyOn(ws,'read').mockImplementation(async file=>file==='config.ts'?'const password = "fixture-secret-value";':'export const value = 42;');
  const ollama=new OllamaService('http://localhost:11434');vi.spyOn(ollama,'models').mockResolvedValue(['embed']);const embed=vi.spyOn(ollama,'embed').mockResolvedValue([[1,0]]);
  const index=new SemanticIndex(ws,ollama,'embed');
  expect(await index.build(new AbortController().signal)).toMatchObject({indexed:1});
  expect(JSON.stringify(embed.mock.calls[0][1])).not.toContain('fixture-secret-value');
});
it('drops cached vectors when the indexed file is found to contain credentials',async()=>{
  const storage=await fs.mkdtemp(join(tmpdir(),'devpilot-index-'));
  try {
    const ws=new WorkspaceService('unused');vi.spyOn(ws,'read').mockResolvedValue('const password = "fixture-secret-value";');
    const ollama=new OllamaService('http://localhost:11434');vi.spyOn(ollama,'embed').mockResolvedValue([[1,0]]);
    const persistence=await PersistenceService.open(storage);
    await persistence.saveSemanticIndex('workspace','embed',[{file:'config.ts',hash:'old-hash',vector:[1,0]}]);
    const index=new SemanticIndex(ws,ollama,'embed',persistence,'workspace');
    expect(await index.search('password',new AbortController().signal)).toMatchObject({matches:[]});
    expect(await persistence.loadSemanticIndex('workspace','embed')).toEqual([]);
  } finally { await fs.rm(storage,{recursive:true,force:true}); }
});
