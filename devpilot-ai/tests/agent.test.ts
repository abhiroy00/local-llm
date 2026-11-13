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
  expect(result).toContain('Found src/a.ts.'); expect(result).toContain('No passing test command'); expect(execute).toHaveBeenCalledWith('read_file',{path:'src/a.ts'},'plan',expect.any(AbortSignal),expect.any(String));
  expect(JSON.stringify(structured.mock.calls[1])).toContain('hello');
});
it('retries malformed JSON once with bounded validation feedback',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  const structured=vi.spyOn(ollama,'structured').mockRejectedValueOnce(new SyntaxError('invalid JSON')).mockResolvedValueOnce({action:'final',summary:'Inspected the task.'});
  const execute=vi.fn();
  const result=await new AgentService(ollama,{catalog:()=>[],execute}).run('test','Inspect this task','plan',4096,signal(),()=>{});
  expect(result).toContain('Inspected the task.');
  expect(structured).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(structured.mock.calls[1])).toContain('malformed JSON');
  expect(execute).not.toHaveBeenCalled();
});
it('redacts detected credentials from the task before model context',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  const structured=vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'final',summary:'Reviewed.'});
  await new AgentService(ollama,{catalog:()=>[],execute:vi.fn()}).run('test','Check password="fixture-secret-value"','plan',4096,signal(),()=>{});
  const request=JSON.stringify(structured.mock.calls[0][1]);
  expect(request).not.toContain('fixture-secret-value');
  expect(request).toContain('[REDACTED:password]');
});
it('repairs schema-invalid decisions and never executes the invalid result',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  const structured=vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'final',summary:''}).mockResolvedValueOnce({action:'final',summary:'Valid result.'});
  const execute=vi.fn();
  expect(await new AgentService(ollama,{catalog:()=>[],execute}).run('test','Inspect','plan',4096,signal(),()=>{})).toContain('Valid result.');
  expect(JSON.stringify(structured.mock.calls[1])).toContain('summary');
  expect(execute).not.toHaveBeenCalled();
});
it('stops after the single repair attempt when decisions remain invalid',async()=>{
  const ollama=new OllamaService('http://localhost:11434');
  const structured=vi.spyOn(ollama,'structured').mockRejectedValueOnce(new SyntaxError('invalid JSON')).mockRejectedValueOnce(new SyntaxError('still invalid'));
  const execute=vi.fn();
  await expect(new AgentService(ollama,{catalog:()=>[],execute}).run('test','Inspect','agent',4096,signal(),()=>{})).rejects.toThrow('after one repair attempt');
  expect(structured).toHaveBeenCalledTimes(2);
  expect(execute).not.toHaveBeenCalled();
});
it('refuses a final answer that skipped every tool, then retries with a nudge',async () => {
  const ollama=new OllamaService('http://localhost:11434');
  const structured=vi.spyOn(ollama,'structured').mockResolvedValueOnce({action:'final',summary:'Task completed.'}).mockResolvedValueOnce({action:'tool',name:'create_file',input:{path:'index.html',content:'<h1>hi</h1>'}}).mockResolvedValueOnce({action:'final',summary:'Created index.html.'});
  const execute=vi.fn().mockResolvedValue({applied:true,file:'index.html'});
  const result=await new AgentService(ollama,{catalog:()=>[],execute}).run('test','Build a landing page','agent',4096,signal(),()=>{});
  expect(result).toContain('Created index.html.'); expect(result).toContain('Applied changes: index.html');
  expect(structured).toHaveBeenCalledTimes(3); expect(execute).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(structured.mock.calls[1])).toContain('No tool has run yet');
});
it('stops with an explicit error when the model never uses a tool in agent mode',async () => {
  const ollama=new OllamaService('http://localhost:11434');const structured=vi.spyOn(ollama,'structured').mockResolvedValue({action:'final',summary:'Task completed.'});
  const execute=vi.fn();
  await expect(new AgentService(ollama,{catalog:()=>[],execute}).run('test','Build a landing page','agent',4096,signal(),()=>{})).rejects.toThrow('without running any tool');
  expect(structured).toHaveBeenCalledTimes(3); expect(execute).not.toHaveBeenCalled();
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
