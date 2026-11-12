import { createHash } from 'node:crypto';
import { WorkspaceService } from '../services/WorkspaceService';
import { OllamaService } from '../services/OllamaService';
export function cosine(a:number[],b:number[]):number {
  if(a.length!==b.length) throw new Error('Embedding dimensions changed. Rebuild the index.');
  let dot=0,aa=0,bb=0;
  for(let i=0;i<a.length;i++) { dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i]; }
  return aa && bb ? dot/Math.sqrt(aa*bb) : 0;
}
export class SemanticIndex {
  private rows:{file:string;hash:string;vector:number[]}[]=[];
  constructor(private readonly workspace:WorkspaceService,private readonly ollama:OllamaService,private readonly model:string) {}
  async build(signal:AbortSignal):Promise<{indexed:number;truncated:boolean}> {
    if(!(await this.ollama.models(signal)).includes(this.model)) throw new Error('Configured embedding model is not installed. Install one yourself or clear Embedding Model to use lexical search.');
    const listing=await this.workspace.files(signal);const inputs:{file:string;hash:string;text:string}[]=[];
    for(const file of listing.files) { signal.throwIfAborted(); if(inputs.length>=48) break; try { const text=(await this.workspace.read(file)).slice(0,1800); if(text.trim()) inputs.push({file,hash:createHash('sha256').update(text).digest('hex'),text}); } catch { /* non-text and excluded files */ } }
    const rows:typeof this.rows=[];
    for(let i=0;i<inputs.length;i+=8) { signal.throwIfAborted(); const batch=inputs.slice(i,i+8);const vectors=await this.ollama.embed(this.model,batch.map(item=>item.text),signal);batch.forEach((item,index)=>rows.push({file:item.file,hash:item.hash,vector:vectors[index]})); }
    signal.throwIfAborted();this.rows=rows;return {indexed:rows.length,truncated:listing.truncated||listing.files.length>inputs.length};
  }
  async search(query:string,signal:AbortSignal):Promise<unknown> {
    if(!this.rows.length) await this.build(signal);
    const [vector]=await this.ollama.embed(this.model,[query],signal);const matches:{file:string;score:number}[]=[];
    for(const row of this.rows) { signal.throwIfAborted(); try { const current=(await this.workspace.read(row.file)).slice(0,1800); if(createHash('sha256').update(current).digest('hex')!==row.hash) continue; matches.push({file:row.file,score:cosine(row.vector,vector)}); } catch { /* changed/excluded files require rebuild */ } }
    return {matches:matches.sort((a,b)=>b.score-a.score).slice(0,5),indexed:this.rows.length,note:'Bounded session index: first 48 allowed files, first 1800 characters each. Stale entries excluded.'};
  }
}
