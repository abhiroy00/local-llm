import { expect,it,vi } from 'vitest';
import { cosine,SemanticIndex } from '../src/indexing/SemanticIndex';
import { OllamaService } from '../src/services/OllamaService';
import { WorkspaceService } from '../src/services/WorkspaceService';
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
