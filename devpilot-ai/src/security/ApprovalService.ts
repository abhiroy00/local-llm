import { randomUUID } from 'node:crypto';
export type ApprovalFunction = (title:string,action:string,signal:AbortSignal)=>Promise<boolean>;
export class ApprovalService {
  pending?: {id:string;title:string;action:string};
  private resolve?: (approved:boolean)=>void;
  constructor(private readonly changed:()=>void) {}
  request:ApprovalFunction = async (title,action,signal) => {
    signal.throwIfAborted();
    if(this.pending) throw new Error('Another approval is already pending.');
    return new Promise<boolean>((resolve,reject)=>{
      const abort=()=>{cleanup();reject(new Error('Approval cancelled.'));};
      const cleanup=()=>{signal.removeEventListener('abort',abort);this.pending=undefined;this.resolve=undefined;this.changed();};
      this.resolve=approved=>{cleanup();resolve(approved);};
      this.pending={id:randomUUID(),title,action};signal.addEventListener('abort',abort,{once:true});this.changed();
      if(signal.aborted) abort();
    });
  };
  respond(id:string,approved:boolean):void { if(this.pending?.id===id) this.resolve?.(approved); }
}
