import {spawn,type ChildProcess} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {StringDecoder} from 'node:string_decoder';
import {processSpec} from '../tools/ProcessSpec';
import {approveCommand} from '../tools/Terminal';
import type {ApprovalFunction} from '../security/ApprovalService';
import type {JobSummary} from '../types/workspace';
export type {JobSummary} from '../types/workspace';
interface Job {summary:JobSummary;child:ChildProcess;timer:ReturnType<typeof setTimeout>;closed:Promise<void>}
/** One approved dev process per workspace, bounded output and lifetime, disposed with its registry. */
export class BackgroundService {
  private jobs=new Map<string,Job>();private starting=false;private disposed=false;private notifyTimer?:ReturnType<typeof setTimeout>;
  private notify():void {if(!this.disposed && !this.notifyTimer) this.notifyTimer=setTimeout(()=>{this.notifyTimer=undefined;this.changed();},150);}
  constructor(private readonly root:string,private readonly approve?:ApprovalFunction,private readonly changed:()=>void=()=>{},private readonly maxLifetimeMs=10*60*1000) {}
  list():JobSummary[] {return [...this.jobs.values()].map(job=>({...job.summary}));}
  read(id:string):JobSummary {const job=this.jobs.get(id);if(!job) throw new Error('Unknown background job in this workspace.');return {...job.summary};}
  async start(script:'dev'|'start',signal:AbortSignal):Promise<{approved:false}|JobSummary> {
    if(this.disposed) throw new Error('Workspace process manager is closed.');
    if(script!=='dev' && script!=='start') throw new Error('Only npm dev and start scripts are supported.');
    if(this.starting || this.list().some(job=>(job.status==='running' || job.status==='stopping'))) throw new Error('Stop the running workspace process before starting another.');
    this.starting=true;
    try {
      if(!await approveCommand(this.root,'npm',['run',script],signal,this.approve)) return {approved:false};signal.throwIfAborted();if(this.disposed) throw new Error('Workspace process manager is closed.');
      const spec=processSpec('npm',['run',script]);
      const child=spawn(spec.executable,spec.args,{cwd:this.root,windowsHide:true,stdio:['ignore','pipe','pipe'],detached:spec.detached});
      const summary:JobSummary={id:randomUUID(),script,status:'running',exitCode:null,startedAt:Date.now(),output:'',truncated:false};
      const out=new StringDecoder('utf8');const err=new StringDecoder('utf8');
      const append=(text:string)=>{if(summary.output.length+text.length>20000) summary.truncated=true;summary.output=(summary.output+text).slice(-20000);this.notify();};
      child.stdout?.on('data',data=>append(out.write(data)));child.stderr?.on('data',data=>append(err.write(data)));
      let finish!:()=>void;const closed=new Promise<void>(resolve=>{finish=resolve;});
      const timer=setTimeout(()=>{void this.stop(summary.id);},this.maxLifetimeMs);
      const job:Job={summary,child,timer,closed};this.jobs.set(summary.id,job);
      child.once('error',error=>{summary.status='failed';append(error.message);clearTimeout(timer);finish();this.notify();});
      child.once('close',code=>{append(out.end()+err.end());summary.exitCode=code;if(summary.status==='stopping') summary.status='stopped';else if(summary.status==='running') summary.status=code===0?'exited':'failed';clearTimeout(timer);finish();this.notify();});
      const abort=()=>{void this.stop(summary.id);};signal.addEventListener('abort',abort,{once:true});
      void closed.finally(()=>signal.removeEventListener('abort',abort));if(signal.aborted) {await this.stop(summary.id);signal.throwIfAborted();}
      while(this.jobs.size>6) {const oldest=[...this.jobs].find(([,value])=>value.summary.status!=='running' && value.summary.status!=='stopping');if(!oldest) break;this.jobs.delete(oldest[0]);}
      this.notify();return {...summary};
    } finally {this.starting=false;}
  }
  async stop(id:string):Promise<JobSummary> {
    const job=this.jobs.get(id);if(!job) throw new Error('Unknown background job in this workspace.');
    if(job.summary.status==='running' || job.summary.status==='stopping') {
      job.summary.status='stopping';clearTimeout(job.timer);
      if(job.child.pid) {
        if(process.platform==='win32') spawn('taskkill',['/PID',String(job.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',()=>job.child.kill('SIGKILL')).on('exit',code=>{if(code!==0) job.child.kill('SIGKILL');});
        else {try {process.kill(-job.child.pid,'SIGKILL');} catch {job.child.kill('SIGKILL');}}
      }
      await Promise.race([job.closed,new Promise<void>(resolve=>{const timer=setTimeout(resolve,3000);timer.unref();})]);this.notify();
    }
    return {...job.summary};
  }
  dispose():void {this.disposed=true;if(this.notifyTimer) clearTimeout(this.notifyTimer);for(const job of this.jobs.values()) if(job.summary.status==='running' || job.summary.status==='stopping') void this.stop(job.summary.id);}
}
