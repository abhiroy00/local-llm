export type ClientMessage = { type: 'ready' | 'newConversation' | 'openSettings' };
export function parseClientMessage(value: unknown): ClientMessage | undefined {
  if (!value || typeof value !== 'object' || !('type' in value)) return;
  const type = value.type;
  if (type === 'ready' || type === 'newConversation' || type === 'openSettings') return { type };
}
