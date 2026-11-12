export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export type ClientMessage = { type: 'ready' | 'newConversation' | 'openSettings' | 'refresh' | 'stop' | 'regenerate' | 'executePlan' } | { type:'approval';id:string;approved:boolean } | { type:'setMode'; mode:'chat'|'plan'|'agent' } | { type: 'send'; text: string } | { type: 'selectModel'; model: string } | { type:'selectConversation'|'deleteConversation';id:string };
export function parseClientMessage(value: unknown): ClientMessage | undefined {
  if (!value || typeof value !== 'object' || !('type' in value)) return;
  const type = value.type;
  if(type==='approval' && 'id' in value && typeof value.id==='string' && value.id.length===36 && 'approved' in value && typeof value.approved==='boolean') return {type,id:value.id,approved:value.approved};
  if((type==='selectConversation' || type==='deleteConversation') && 'id' in value && typeof value.id==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)) return {type,id:value.id};
  if (type === 'ready' || type === 'newConversation' || type === 'openSettings' || type === 'refresh' || type === 'stop' || type === 'regenerate' || type === 'executePlan') return { type };
  if (type === 'setMode' && 'mode' in value && (value.mode === 'chat' || value.mode === 'plan' || value.mode === 'agent')) return {type,mode:value.mode};
  if (type === 'send' && 'text' in value && typeof value.text === 'string' && value.text.trim() && value.text.length <= 16000) return { type, text: value.text.trim() };
  if (type === 'selectModel' && 'model' in value && typeof value.model === 'string' && value.model.length <= 200) return { type, model: value.model };
}
