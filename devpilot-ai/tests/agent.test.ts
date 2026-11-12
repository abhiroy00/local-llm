import { expect, it, vi } from 'vitest';
import { AgentService, decisionSchema } from '../src/services/AgentService';
import { OllamaService } from '../src/services/OllamaService';
import { validateCommand } from '../src/security/Commands';
const signal = () => new AbortController().signal;
it('runs read tool results into the next decision and produces a final summary',async () => {
  const ollama = new OllamaService('http://localhost:11434');
  const structured=vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'tool',name:'read_file',input:{path:'src/a.ts'}}).mockResolvedValueOnce({action:'final',summary:'Found src/a.ts.'});
  const execute=vi.fn().mockResolvedValue({content:'hello'});
  const result=await new AgentService(ollama,{catalog:()=>[],execute}).run('test','Explain project','plan',4096,signal(),()=>{});
  expect(result).toContain('Found src/a.ts.'); expect(result).toContain('No passing test command'); expect(execute).toHaveBeenCalledWith('read_file',{path:'src/a.ts'},'plan',expect.any(AbortSignal));
  expect(JSON.stringify(structured.mock.calls[1])).toContain('hello');
});
it('stops repeated calls and never executes beyond the loop threshold',async () => {
  const ollama=new OllamaService('http://localhost:11434');vi.spyOn(ollama,'structured').mockResolvedValue({action:'tool',name:'list_files',input:{}});
  const execute=vi.fn().mockResolvedValue({files:[]});
  await expect(new AgentService(ollama,{catalog:()=>[],execute}).run('test','inspect','agent',4096,signal(),()=>{})).rejects.toThrow('Repeated tool loop');
  expect(execute).toHaveBeenCalledTimes(2);
});
it('stops immediately after user rejection, without model retries',async () => {
  const ollama=new OllamaService('http://localhost:11434');const call=vi.spyOn(ollama,'structured').mockResolvedValue({action:'tool',name:'edit_file',input:{}});
  const execute=vi.fn().mockResolvedValue({applied:false});
  expect(await new AgentService(ollama,{catalog:()=>[],execute}).run('test','edit','agent',4096,signal(),()=>{})).toContain('rejected');
  expect(call).toHaveBeenCalledTimes(1);
});
it('rejects malformed decisions and honors pre-cancellation',async () => {
  expect(()=>decisionSchema.parse({action:'shell',command:'format C:'})).toThrow();
  const ollama=new OllamaService('http://localhost:11434');const call=vi.spyOn(ollama,'structured');const controller=new AbortController();controller.abort();
  await expect(new AgentService(ollama,{catalog:()=>[],execute:vi.fn()}).run('test','inspect','plan',4096,controller.signal,()=>{})).rejects.toThrow();expect(call).not.toHaveBeenCalled();
});
it('enforces command allowlists and blocks destructive or injected commands',() => {
  for(const [exe,args] of [['powershell',['-Command','anything']],['npm',['run','deploy']],['git',['reset','--hard']],['node',['-e','process.exit()']],['npm',['test','&','format']],['python',['-c','print(1)']]] as [string,string[]][]) expect(()=>validateCommand(exe,args)).toThrow();
  for(const [exe,args] of [['npm',['test']],['npm',['run','build']],['git',['status']],['python',['-m','pytest']],['node',['--version']]] as [string,string[]][]) expect(()=>validateCommand(exe,args)).not.toThrow();
});
