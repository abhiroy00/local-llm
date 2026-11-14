import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BackgroundService} from '../src/services/BackgroundService';
import {workspace} from './vscode.mock';
let root:string;let service:BackgroundService;
const signal=()=>new AbortController().signal;
async function waitFor(check:()=>boolean):Promise<void> {const deadline=Date.now()+5000;while(!check()) {if(Date.now()>deadline) throw new Error('Process state timeout');await new Promise(resolve=>setTimeout(resolve,25));}}
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'devpilot-jobs-'));workspace.isTrusted=true;await fs.writeFile(path.join(root,'package.json'),JSON.stringify({scripts:{dev:'node server.cjs',start:'node server.cjs'}}));await fs.writeFile(path.join(root,'server.cjs'),"process.stdout.write('x'.repeat(25000)+' ready ✓');setInterval(()=>{},1000);");service=new BackgroundService(root,async()=>true);});
afterEach(async()=>{for(const job of service.list()) await service.stop(job.id);service.dispose();await fs.rm(root,{recursive:true,force:true});});
it('does not spawn rejected commands or commands with a changed approval manifest',async()=>{
  service.dispose();const approve=vi.fn(async()=>false);service=new BackgroundService(root,approve);
  expect(await service.start('dev',signal())).toEqual({approved:false});expect(service.list()).toEqual([]);expect(approve).toHaveBeenCalledOnce();
  service.dispose();service=new BackgroundService(root,async()=>{await fs.writeFile(path.join(root,'package.json'),'{}');return true;});
  await expect(service.start('dev',signal())).rejects.toThrow('package.json changed');expect(service.list()).toEqual([]);
});
it('bounds real process output, preserves unicode, prevents duplicate processes and stops the tree',async()=>{
  const job=await service.start('dev',signal());if(!('id' in job)) throw new Error('Rejected');
  await waitFor(()=>service.read(job.id).output.includes('ready ✓'));
  expect(service.read(job.id).output.length).toBeLessThanOrEqual(20000);expect(service.read(job.id).truncated).toBe(true);
  await expect(service.start('start',signal())).rejects.toThrow('Stop the running');
  expect(await service.stop(job.id)).toMatchObject({status:'stopped'});
  expect(await service.stop(job.id)).toMatchObject({status:'stopped'});
});
it('stops processes on cancellation and lifetime expiry and rejects disposed managers',async()=>{
  const controller=new AbortController();const job=await service.start('dev',controller.signal);if(!('id' in job)) throw new Error('Rejected');controller.abort();
  await waitFor(()=>service.read(job.id).status==='stopped');service.dispose();
  service=new BackgroundService(root,async()=>true,()=>{},50);const timed=await service.start('dev',signal());if(!('id' in timed)) throw new Error('Rejected');
  await waitFor(()=>service.read(timed.id).status==='stopped');service.dispose();await expect(service.start('dev',signal())).rejects.toThrow('closed');
});
it('reports command failure as failed rather than server readiness',async()=>{
  await fs.writeFile(path.join(root,'server.cjs'),"console.error('fixture failure');process.exit(7);");const job=await service.start('dev',signal());if(!('id' in job)) throw new Error('Rejected');
  await waitFor(()=>service.read(job.id).status==='failed');expect(service.read(job.id)).toMatchObject({exitCode:7});expect(service.read(job.id).output).toContain('fixture failure');
});
