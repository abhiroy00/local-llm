import { createServer } from 'node:http';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { OllamaService } from '../src/services/OllamaService';

it('uses the real HTTP transport against a local Ollama protocol test server', async () => {
  let body = '';
  const server = createServer(async (request,response) => {
    if (request.url === '/api/tags') {
      response.setHeader('Content-Type','application/json');
      response.end(JSON.stringify({models:[{name:'protocol-test'}]})); return;
    }
    if (request.url === '/api/chat' && request.method === 'POST') {
      for await (const chunk of request) body += chunk.toString();
      response.setHeader('Content-Type','application/x-ndjson');
      response.write('{"message":{"content":"hello"},"done":false}\n');
      response.end('{"message":{"content":" world"},"done":true,"eval_count":2}\n'); return;
    }
    response.writeHead(404).end();
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP server');
    const service = new OllamaService(`http://127.0.0.1:${address.port}`);
    expect(await service.models()).toEqual(['protocol-test']);
    let output = '';
    const usage = await service.chat('protocol-test',[{role:'user',content:'test prompt'}],4096,new AbortController().signal,chunk => { output += chunk; });
    expect(output).toBe('hello world'); expect(usage.completion).toBe(2);
    expect(JSON.parse(body).messages).toEqual([{role:'user',content:'test prompt'}]);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
