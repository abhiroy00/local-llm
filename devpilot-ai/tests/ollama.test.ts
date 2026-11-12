import { describe, expect, it, vi } from 'vitest';
import { boundedContext, localEndpoint, OllamaService } from '../src/services/OllamaService';

describe('local inference boundary', () => {
  it('rejects remote endpoints, credentials, paths and non-HTTP schemes', () => {
    for (const url of ['https://example.com','http://localhost@evil.com','file:///tmp','http://localhost/proxy','http://user:pass@localhost','http://localhost?token=secret']) expect(() => localEndpoint(url)).toThrow();
    expect(localEndpoint('http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434');
  });
  it('retains recent context without orphan assistant turns or oversized prompts', () => {
    expect(boundedContext([{role:'user',content:'a'.repeat(501)},{role:'assistant',content:'answer'},{role:'user',content:'latest'}],512)).toEqual([{role:'user',content:'latest'}]);
    expect(() => boundedContext([{role:'user',content:'a'.repeat(513)}],512)).toThrow('context budget');
  });
  it('discovers installed models and retries one failed discovery', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Response(JSON.stringify({models:[{name:'local:test'},{name:'local:test'}]})));
    expect(await new OllamaService('http://localhost:11434',fetcher).models()).toEqual(['local:test']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('decodes fragmented UTF-8, multiple frames and final frame without newline', async () => {
    const data = new TextEncoder().encode(JSON.stringify({message:{content:'नमस्ते'}})+'\n'+JSON.stringify({message:{content:' world'},done:true,prompt_eval_count:4,eval_count:2}));
    const stream = new ReadableStream<Uint8Array>({start(controller) { for (const byte of data) controller.enqueue(new Uint8Array([byte])); controller.close(); }});
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream));
    let text = '';
    const usage = await new OllamaService('http://localhost:11434',fetcher).chat('local:test',[{role:'user',content:'hello'}],4096,new AbortController().signal,chunk => { text += chunk; });
    expect(text).toBe('नमस्ते world'); expect(usage).toEqual({prompt:4,completion:2});
    const body = JSON.parse(fetcher.mock.calls[0][1]?.body as string);
    expect(body.stream).toBe(true); expect(body.options.num_ctx).toBe(4096);
  });
  it('reports missing models, malformed frames and truncated streams', async () => {
    for (const response of [new Response('',{status:404}),new Response('invalid\n'),new Response('{"message":{"content":"partial"}}\n')]) {
      const service = new OllamaService('http://localhost:11434',vi.fn<typeof fetch>().mockResolvedValue(response));
      await expect(service.chat('missing',[{role:'user',content:'hi'}],4096,new AbortController().signal,() => {})).rejects.toThrow();
    }
  });
  it('propagates cancellation without retrying generation', async () => {
    const controller = new AbortController(); controller.abort();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url,init) => { init?.signal?.throwIfAborted(); return new Response(); });
    await expect(new OllamaService('http://localhost:11434',fetcher).chat('test',[],4096,controller.signal,() => {})).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
