export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export type ClientMessage = { type: 'ready' | 'newConversation' | 'openSettings' | 'refresh' | 'stop' | 'regenerate' | 'executePlan' | 'attachFile' | 'revertChange' | 'indexWorkspace' | 'openModelSetup' | 'closeModelSetup' | 'runNpmTests' } | {type:'reviewCheckpoint';id:string;path:string} | {type:'revertCheckpoint'|'stopProcess';id:string} | {type:'startProcess';script:'dev'|'start'} | {type:'installModel'|'modelSource';profileId:string} | {type:'removeAttachment';path:string} | { type:'approval';id:string;approved:boolean } | { type:'setMode'; mode:'chat'|'plan'|'agent' } | { type: 'send'; text: string } | { type: 'selectModel'; model: string } | { type:'selectConversation'|'deleteConversation';id:string };
export function parseClientMessage(value: unknown): ClientMessage | undefined {
  if (!value || typeof value !== 'object' || !('type' in value)) return;
  const type = value.type;
  if(type==='startProcess' && 'script' in value && (value.script==='dev' || value.script==='start')) return {type,script:value.script};
  if((type==='reviewCheckpoint' || type==='revertCheckpoint' || type==='stopProcess') && 'id' in value && typeof value.id==='string' && /^[a-f0-9-]{36}$/i.test(value.id)) {
    if(type==='reviewCheckpoint') {if('path' in value && typeof value.path==='string' && value.path.length<=300) return {type,id:value.id,path:value.path};}
    else return {type,id:value.id};
  }
  if((type==='installModel' || type==='modelSource') && 'profileId' in value && typeof value.profileId==='string' && ['deepseek-coder','deepseek-reasoning','deepseek-small'].includes(value.profileId)) return {type,profileId:value.profileId};
  if(type==='approval' && 'id' in value && typeof value.id==='string' && value.id.length===36 && 'approved' in value && typeof value.approved==='boolean') return {type,id:value.id,approved:value.approved};
  if((type==='selectConversation' || type==='deleteConversation') && 'id' in value && typeof value.id==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)) return {type,id:value.id};
  if (type === 'ready' || type === 'newConversation' || type === 'openSettings' || type === 'refresh' || type === 'stop' || type === 'regenerate' || type === 'executePlan' || type === 'attachFile' || type === 'revertChange' || type === 'indexWorkspace' || type === 'openModelSetup' || type === 'closeModelSetup' || type === 'runNpmTests') return { type };
  if(type==='removeAttachment' && 'path' in value && typeof value.path==='string' && value.path.length<=300) return {type,path:value.path};
  if (type === 'setMode' && 'mode' in value && (value.mode === 'chat' || value.mode === 'plan' || value.mode === 'agent')) return {type,mode:value.mode};
  if (type === 'send' && 'text' in value && typeof value.text === 'string' && value.text.trim() && value.text.length <= 16000) return { type, text: value.text.trim() };
  if (type === 'selectModel' && 'model' in value && typeof value.model === 'string' && value.model.length <= 200) return { type, model: value.model };
}
