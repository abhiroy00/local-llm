import { modelProfile, deepseekProfiles } from '../models/ModelCatalog';
import { AnswerFilter } from './AnswerFilter';
import type { ChatMessage } from '../types';

export function localEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use a local Ollama endpoint, for example http://localhost:11434.');
  }
  return url.origin;
}

export function boundedContext(messages: ChatMessage[], contextLimit: number): ChatMessage[] {
  // Conservative character estimate; reserve half the window for output/system overhead.
  const budget = Math.max(512, Math.floor(contextLimit));
  const result: ChatMessage[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const item = messages[i];
    if (used + item.content.length > budget) {
      if (!result.length) throw new Error(`Message exceeds the context budget (${budget} characters). Shorten it or increase Context Limit.`);
      break;
    }
    result.unshift(item); used += item.content.length;
  }
  while (result[0]?.role === 'assistant') result.shift();
  return result;
}

export class OllamaService {
  private readonly endpoint: string;
  constructor(endpoint: string, private readonly transport: typeof fetch = fetch, private readonly inferenceProfile:'low-memory'|'balanced'='low-memory') { this.endpoint = localEndpoint(endpoint); }
  private checkInferenceBudget(model:string,contextLimit:number):void {
    if(this.inferenceProfile!=='low-memory') return;
    if(contextLimit>4096) throw new Error('Low-memory mode limits context to 4096. Reduce Context Limit before retrying.');
    if(deepseekProfiles.some(profile=>profile.model===model && profile.minimumRAMGB>8)) throw new Error('This larger DeepSeek model is disabled in low-memory mode after the interrupted 16 GB test. Select DeepSeek Coder 1.3B or your existing small model. Balanced mode is an explicit advanced opt-in, not validated on this Mac.');
  }
  private async request(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try { response = await this.transport(this.endpoint + path, { ...init, redirect: 'error' }); }
    catch (error) {
      if (init.signal?.aborted) throw error;
      throw new Error('Cannot connect to Ollama. Start Ollama and check DevPilot AI settings.');
    }
    if (!response.ok) throw new Error(response.status === 404 ? 'Ollama model or API not found. Refresh models and select an installed chat model.' : `Ollama request failed (HTTP ${response.status}). Check Ollama logs and available memory.`);
    return response;
  }
  async pull(profileId:string,signal:AbortSignal,onProgress:(event:{status:string;completed?:number;total?:number})=>void):Promise<void> {
    const profile=modelProfile(profileId);signal=AbortSignal.any([signal,AbortSignal.timeout(30*60*1000)]);signal.throwIfAborted();
    const response=await this.request('/api/pull',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({model:profile.model,stream:true})});
    if(!response.body) throw new Error('Ollama returned no download stream.');
    const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';let complete=false;
    const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
    const consume=(line:string)=>{
      const data=JSON.parse(line);
      if(data.error) throw new Error(`Model download failed: ${String(data.error).slice(0,300)}`);
      if(typeof data.status!=='string' || data.status.length>300 || ['completed','total'].some(key=>data[key]!==undefined && (typeof data[key]!=='number' || !Number.isFinite(data[key]) || data[key]<0))) throw new Error('Invalid model download progress.');
      onProgress({status:data.status,completed:data.completed,total:data.total});if(data.status==='success') complete=true;
    };
    try {
      while(!complete) {
        signal.throwIfAborted();const {value,done}=await reader.read();signal.throwIfAborted();buffer+=decoder.decode(value,{stream:!done});
        if(buffer.length>256*1024) throw new Error('Model download progress frame too large.');
        let newline:number;while((newline=buffer.indexOf('\n'))>=0) {const line=buffer.slice(0,newline).trim();buffer=buffer.slice(newline+1);if(line) consume(line);}
        if(done) {if(buffer.trim()) consume(buffer);if(!complete) throw new Error('Download ended before success. Retry to resume cached layers.');}
      }
    } finally {signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
  }
  async models(signal?: AbortSignal): Promise<string[]> {
    const timeout = AbortSignal.timeout(8000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    // Retry only the idempotent discovery request, never a generation.
    let response: Response;
    try { response = await this.request('/api/tags', {signal:combined}); }
    catch (error) { if (combined.aborted) throw error; response = await this.request('/api/tags', {signal:combined}); }
    const data = await response.json();
    if (!Array.isArray(data.models) || data.models.some((m: { name?: unknown }) => !m || typeof m.name !== 'string')) throw new Error('Invalid Ollama model list.');
    return [...new Set<string>(data.models.map((m: { name: string }) => m.name))];
  }
  async embed(model:string,input:string[],signal:AbortSignal):Promise<number[][]> {
    if(input.length>16 || input.some(text=>text.length>2000)) throw new Error('Embedding batch limit exceeded.');
    const response=await this.request('/api/embed',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({model,input,keep_alive:'1m'})});
    const data=await response.json();
    if(!Array.isArray(data.embeddings) || data.embeddings.length!==input.length || data.embeddings.some((v:unknown)=>!Array.isArray(v)||v.length===0||v.length>8192||v.some((n:unknown)=>typeof n!=='number'||!Number.isFinite(n)))) throw new Error('Invalid embedding response. Select a compatible installed embedding model.');
    return data.embeddings;
  }
  async structured(model:string,messages:ChatMessage[],contextLimit:number,signal:AbortSignal,format:unknown = 'json'):Promise<unknown> {
    signal = AbortSignal.any([signal,AbortSignal.timeout(120000)]);
    if (!Number.isInteger(contextLimit) || contextLimit<1024 || contextLimit>32768) throw new Error('Invalid context limit.');
    if (messages.reduce((total,m) => total+m.content.length,0)>contextLimit*3) throw new Error('Agent protocol exceeds context budget. Increase Context Limit.');
    this.checkInferenceBudget(model,contextLimit);
    const response = await this.request('/api/chat',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({model,messages,stream:true,format,...(/^deepseek-r1(?::|$)/i.test(model)?{think:false}:{}),keep_alive:this.inferenceProfile==='low-memory'?'30s':'2m',options:{num_ctx:contextLimit,num_predict:Math.min(this.inferenceProfile==='low-memory'?768:4096,Math.floor(contextLimit/2)),...(this.inferenceProfile==='low-memory'?{num_batch:64,num_thread:4}:{}),temperature:0}})});
    if (!response.body) throw new Error('Missing structured response.');
    const reader=response.body.getReader(); const decoder=new TextDecoder(); let buffer=''; let content=''; let complete=false;const filter=new AnswerFilter(/^deepseek-r1(?::|$)/i.test(model));
    const consume=(line:string) => { const data=JSON.parse(line); if(data.error) throw new Error('Model rejected structured generation. Choose a chat model with JSON output support.'); if(typeof data.message?.content==='string') content+=filter.push(data.message.content); if(content.length>128*1024) throw new Error('Agent response too large.'); if(data.done===true) {content+=filter.finish();complete=true;} };
    try { while(!complete) { const {value,done}=await reader.read(); buffer+=decoder.decode(value,{stream:!done}); if(buffer.length>256*1024) throw new Error('Agent stream frame too large.'); let index:number; while((index=buffer.indexOf('\n'))>=0) { const line=buffer.slice(0,index).trim(); buffer=buffer.slice(index+1); if(line) consume(line); } if(done) { if(buffer.trim()) consume(buffer); if(!complete) throw new Error('Agent response ended early.'); } } if(!content.trim()) throw new Error('The model returned no final JSON answer. Try DeepSeek Coder or a shorter task.');return JSON.parse(content); }
    finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  }
  async chat(model: string, messages: ChatMessage[], contextLimit: number, signal: AbortSignal, onText: (text: string) => void): Promise<{prompt?: number; completion?: number}> {
    if (!Number.isInteger(contextLimit) || contextLimit < 1024 || contextLimit > 32768) throw new Error('Context Limit must be between 1024 and 32768.');
    this.checkInferenceBudget(model,contextLimit);
    const response = await this.request('/api/chat', {method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({model,messages:boundedContext(messages,contextLimit),stream:true,...(/^deepseek-r1(?::|$)/i.test(model)?{think:false}:{}),keep_alive:this.inferenceProfile==='low-memory'?'30s':'2m',options:{num_ctx:contextLimit,num_predict:Math.min(this.inferenceProfile==='low-memory'?768:4096,Math.floor(contextLimit/2)),...(this.inferenceProfile==='low-memory'?{num_batch:64,num_thread:4}:{})}})});
    if (!response.body) throw new Error('Ollama returned no response stream.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = ''; let total = 0;const filter=new AnswerFilter(/^deepseek-r1(?::|$)/i.test(model));
    const parse = (line: string) => {
      const data = JSON.parse(line);
      if (data.error) throw new Error('Ollama generation failed. Check that the selected model supports chat and fits in memory.');
      const raw = data.message?.content;
      const text=typeof raw==='string' ? filter.push(raw) : raw;
      if (text !== undefined && typeof text !== 'string') throw new Error('Invalid Ollama response content.');
      if (text) { total += text.length; if (total > 200000) throw new Error('Response size limit reached.'); onText(text); }
      if(data.done===true) {const tail=filter.finish();if(tail) {onText(tail);total+=tail.length;}if(!total) throw new Error('The model returned no final answer. Try DeepSeek Coder or a shorter task.');}
      if (data.done === true) return {prompt:typeof data.prompt_eval_count === 'number' ? data.prompt_eval_count : undefined,completion:typeof data.eval_count === 'number' ? data.eval_count : undefined};
    };
    try {
      while (true) {
        const {value,done} = await reader.read();
        buffer += decoder.decode(value, {stream:!done});
        if (buffer.length > 1000000) throw new Error('Ollama stream frame too large.');
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0,newline).trim(); buffer = buffer.slice(newline+1);
          if (line) { const usage = parse(line); if (usage) return usage; }
        }
        if (done) { if (buffer.trim()) { const usage = parse(buffer); if (usage) return usage; } throw new Error('Ollama response ended early. Retry the response.'); }
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
}
