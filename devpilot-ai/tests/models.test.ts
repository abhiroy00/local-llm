import {expect,it,vi} from 'vitest';
import {deepseekProfiles,modelProfile,recommendedProfile} from '../src/models/ModelCatalog';
import {OllamaService} from '../src/services/OllamaService';
import {AnswerFilter} from '../src/services/AnswerFilter';
import {processSpec} from '../src/tools/ProcessSpec';
import {parseClientMessage} from '../src/types';
const signal=()=>new AbortController().signal;
it('provides official DeepSeek provenance and quantized profiles suitable for constrained hardware',()=>{
  expect(recommendedProfile(16).model).toBe('deepseek-coder:1.3b');expect(recommendedProfile(8).model).toBe('deepseek-coder:1.3b');
  for(const profile of deepseekProfiles) {expect(new URL(profile.source).host).toBe('huggingface.co');expect(new URL(profile.source).pathname).toMatch(/^\/deepseek-ai\//);expect(profile.downloadGB).toBeLessThan(6);}
  expect(()=>modelProfile('https://paid-provider.example')).toThrow();
  expect(parseClientMessage({type:'installModel',profileId:'deepseek-coder'})).toEqual({type:'installModel',profileId:'deepseek-coder'});
  expect(parseClientMessage({type:'installModel',profileId:'arbitrary'})).toBeUndefined();
});
it('pulls only a catalog model through the local API and reports streamed progress',async()=>{
  const bytes=new TextEncoder().encode('{"status":"pulling layer","completed":3,"total":10}\n{"status":"success"}');
  const stream=new ReadableStream<Uint8Array>({start(controller){for(const byte of bytes) controller.enqueue(new Uint8Array([byte]));controller.close();}});
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(stream));const progress=vi.fn();
  await new OllamaService('http://localhost:11434',fetcher).pull('deepseek-coder',signal(),progress);
  expect(fetcher.mock.calls[0][0]).toBe('http://localhost:11434/api/pull');expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string)).toEqual({model:'deepseek-coder:6.7b',stream:true});
  expect(progress).toHaveBeenCalledWith({status:'pulling layer',completed:3,total:10});expect(progress).toHaveBeenLastCalledWith({status:'success'});
});
it('rejects failed/truncated download streams and never treats a partial download as installed',async()=>{
  for(const data of ['{"status":"pulling"}\n','{"error":"disk full"}\n','{"status":"pulling","completed":-1}\n','invalid\n']) {
    await expect(new OllamaService('http://localhost:11434',vi.fn<typeof fetch>().mockResolvedValue(new Response(data))).pull('deepseek-coder',signal(),()=>{})).rejects.toThrow();
  }
});
it('cancels a stalled model download and rejects unknown models before any request',async()=>{
  const cancel=vi.fn();const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({cancel})));
  const controller=new AbortController();const promise=new OllamaService('http://localhost:11434',fetcher).pull('deepseek-coder',controller.signal,()=>{});
  await vi.waitFor(()=>expect(fetcher).toHaveBeenCalled());controller.abort();await expect(promise).rejects.toThrow();expect(cancel).toHaveBeenCalled();
  await expect(new OllamaService('http://localhost:11434',fetcher).pull('custom',signal(),()=>{})).rejects.toThrow('supported');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('keeps legacy think blocks out of answers across arbitrary chunk boundaries',()=>{
  const filter=new AnswerFilter();let text='';
  for(const char of '<think>Internal reasoning</think>{"action":"final","summary":"Answer"}') text+=filter.push(char);
  text+=filter.finish();expect(text).toBe('{"action":"final","summary":"Answer"}');
  const incomplete=new AnswerFilter();expect(incomplete.push('<think>unfinished')).toBe('');expect(()=>incomplete.finish()).toThrow('final answer');
});
it('handles DeepSeek reasoning separately from structured tool output',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('{"message":{"thinking":"private trace","content":""}}\n{"message":{"content":"{\\"action\\":\\"final\\",\\"summary\\":\\"Done\\"}"},"done":true}\n'));
  expect(await new OllamaService('http://localhost:11434',fetcher).structured('deepseek-r1:1.5b',[{role:'user',content:'hello'}],4096,signal())).toEqual({action:'final',summary:'Done'});
  expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string).think).toBe(false);
});
it('does not publish a reasoning-only response as a blank successful chat answer',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('{"message":{"thinking":"trace"},"done":true}\n'));
  const text=vi.fn();await expect(new OllamaService('http://localhost:11434',fetcher).chat('deepseek-r1:1.5b',[{role:'user',content:'hello'}],4096,signal(),text)).rejects.toThrow('no final answer');expect(text).not.toHaveBeenCalled();
});
it('builds secure Windows and POSIX process specifications without platform-dependent shell quoting',()=>{
  expect(processSpec('npm',['test','--','--run'],'win32',{})).toEqual({executable:'C:\\Windows\\System32\\cmd.exe',args:['/d','/s','/c','npm test -- --run'],detached:false});
  expect(processSpec('npm',['test'],'darwin',{})).toEqual({executable:'npm',args:['test'],detached:true});
  expect(processSpec('git',['diff'],'win32',{}).args).toContain('--no-ext-diff');
  expect(processSpec('python3',['-m','pytest'],'win32',{}).detached).toBe(false);
  expect(()=>processSpec('npm',['test','&','echo'],'win32',{})).toThrow();
});
it('defaults to bounded low-memory generation and retains an explicit balanced option',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>new Response('{"message":{"content":"{\\"action\\":\\"final\\",\\"summary\\":\\"Done\\"}"},"done":true}\n'));
  await new OllamaService('http://localhost:11434',fetcher).structured('deepseek-coder:1.3b',[{role:'user',content:'hello'}],4096,signal());
  const low=JSON.parse(fetcher.mock.calls[0][1]?.body as string);
  expect(low.options).toMatchObject({num_predict:768,num_batch:64,num_thread:4});expect(low.keep_alive).toBe('30s');
  await new OllamaService('http://localhost:11434',fetcher,'balanced').structured('model',[{role:'user',content:'hello'}],4096,signal());
  const balanced=JSON.parse(fetcher.mock.calls[1][1]?.body as string);expect(balanced.options.num_predict).toBe(2048);expect(balanced.keep_alive).toBe('2m');
});

it('blocks heavy catalog models and oversized context before inference in low-memory mode',async()=>{
  const fetcher=vi.fn<typeof fetch>();const service=new OllamaService('http://localhost:11434',fetcher);
  await expect(service.structured('deepseek-coder:6.7b',[{role:'user',content:'hello'}],4096,signal())).rejects.toThrow('disabled in low-memory');
  await expect(service.chat('deepseek-coder:1.3b',[{role:'user',content:'hello'}],8192,signal(),()=>{})).rejects.toThrow('limits context');
  expect(fetcher).not.toHaveBeenCalled();
});
