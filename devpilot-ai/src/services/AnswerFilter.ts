/** Older reasoning templates put a leading think block in content instead of a separate field. */
export class AnswerFilter {
  constructor(private readonly enabled=true) {}
  private buffer='';
  private mode:'start'|'thinking'|'answer'='start';
  push(text:string):string {
    if(!this.enabled) return text;
    if(this.mode==='answer') return text;
    this.buffer+=text;
    if(this.buffer.length>256*1024) throw new Error('Reasoning exceeded the response budget. Try DeepSeek Coder or a smaller task.');
    if(this.mode==='start') {
      const trimmed=this.buffer.trimStart();
      if(!trimmed || (trimmed!=='<think>' && '<think>'.startsWith(trimmed))) return '';
      if(trimmed.startsWith('<think>')) {this.mode='thinking';this.buffer=trimmed.slice(7);}
      else {this.mode='answer';const answer=this.buffer;this.buffer='';return answer;}
    }
    const end=this.buffer.indexOf('</think>');
    if(end<0) return '';
    const answer=this.buffer.slice(end+8);this.buffer='';this.mode='answer';return answer;
  }
  finish():string {
    if(!this.enabled) return '';
    if(this.mode==='thinking' || (this.mode==='start' && this.buffer.trim() && '<think>'.startsWith(this.buffer.trim()))) throw new Error('The model ended before producing a final answer. Try DeepSeek Coder or a shorter task.');
    const answer=this.buffer;this.buffer='';return answer;
  }
}
