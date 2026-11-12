import {expect,it,vi} from 'vitest';
import {ApprovalService} from '../src/security/ApprovalService';
it('requires the exact pending request id and clears after a decision',async()=>{
 const service=new ApprovalService(vi.fn());const pending=service.request('test','Apply',new AbortController().signal);service.respond('wrong',true);expect(service.pending).toBeDefined();service.respond(service.pending!.id,false);expect(await pending).toBe(false);expect(service.pending).toBeUndefined();
});
it('cancels approvals and prevents overlapping approval requests',async()=>{
 const controller=new AbortController();const service=new ApprovalService(vi.fn());const pending=service.request('test','Apply',controller.signal);await expect(service.request('other','Apply',new AbortController().signal)).rejects.toThrow('already pending');const rejected=expect(pending).rejects.toThrow('cancelled');controller.abort();await rejected;expect(service.pending).toBeUndefined();
});
