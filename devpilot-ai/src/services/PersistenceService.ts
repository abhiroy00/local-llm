import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { ChatMessage } from '../types';
import { containsSecrets, redactSecrets } from '../security/SecretRedactor';

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
}

export interface SemanticEntry {
  file: string;
  hash: string;
  vector: number[];
}

export interface UndoRecord {
  path: string;
  before: string | undefined;
  after: string | undefined;
}

export interface AuditEvent {
  id:string;
  taskId:string;
  timestamp:number;
  tool:string;
  argsSummary:string;
  approval:'not_required'|'pending'|'approved'|'rejected'|'unknown';
  outcome:'started'|'succeeded'|'rejected'|'failed';
  resultSummary:string;
  detail?:string;
}

interface Conversation extends ConversationSummary {
  workspace: string;
  createdAt: number;
  messages: ChatMessage[];
}

interface StoreState {
  version: 2;
  conversations: Conversation[];
  indexes: Record<string, SemanticEntry[]>;
  undo: Record<string, UndoRecord[]>;
  auditEvents:AuditEvent[];
}

const maxAuditEvents=1000;
const emptyState = (): StoreState => ({version:2,conversations:[],indexes:{},undo:{},auditEvents:[]});
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function decodeState(raw: string): {state:StoreState;migrated:boolean} {
  const parsed: unknown = JSON.parse(raw);
  if (!isObject(parsed) || (parsed.version !== 1 && parsed.version !== 2) || !Array.isArray(parsed.conversations) || !isObject(parsed.indexes) || !isObject(parsed.undo)) {
    throw new Error('Persistent data format is invalid or unsupported.');
  }
  const migrated=parsed.version===1;
  const auditEvents=migrated ? [] : parsed.auditEvents;
  if(!Array.isArray(auditEvents) || !auditEvents.every(item => isObject(item) && typeof item.id==='string' && typeof item.taskId==='string' &&
    typeof item.timestamp==='number' && Number.isFinite(item.timestamp) && typeof item.tool==='string' && typeof item.argsSummary==='string' &&
    typeof item.resultSummary==='string' && ['not_required','pending','approved','rejected','unknown'].includes(String(item.approval)) &&
    ['started','succeeded','rejected','failed'].includes(String(item.outcome)) && (item.detail===undefined || typeof item.detail==='string'))) {
    throw new Error('Persistent audit data is invalid.');
  }
  const validMessages = (messages:unknown):messages is ChatMessage[] => Array.isArray(messages) && messages.every(message =>
    isObject(message) && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string');
  if (!parsed.conversations.every(item => isObject(item) && typeof item.id === 'string' && typeof item.workspace === 'string' &&
    typeof item.title === 'string' && typeof item.createdAt === 'number' && typeof item.updatedAt === 'number' && validMessages(item.messages))) {
    throw new Error('Persistent conversation data is invalid.');
  }
  for (const entries of Object.values(parsed.indexes)) {
    if (!Array.isArray(entries) || !entries.every(item => isObject(item) && typeof item.file === 'string' &&
      typeof item.hash === 'string' && Array.isArray(item.vector) && item.vector.every(value => typeof value === 'number' && Number.isFinite(value)))) {
      throw new Error('Persistent semantic index data is invalid.');
    }
  }
  for (const records of Object.values(parsed.undo)) {
    if (!Array.isArray(records) || !records.every(item => isObject(item) && typeof item.path === 'string' &&
      (typeof item.before === 'string' || item.before === undefined) && (typeof item.after === 'string' || item.after === undefined))) {
      throw new Error('Persistent undo data is invalid.');
    }
  }
  return {state:{...parsed,version:2,auditEvents:auditEvents.slice(-maxAuditEvents)} as unknown as StoreState,migrated};
}

export function workspaceKey(root: string): string {
  const normalized=root.replace(/\\/g,'/');
  return createHash('sha256').update(process.platform==='win32' ? normalized.toLowerCase() : normalized).digest('hex');
}

export class PersistenceService {
  private readonly file: string;
  private state: StoreState;
  private queue: Promise<void> = Promise.resolve();
  private readonly notices:string[]=[];

  private constructor(file: string, state: StoreState) {
    this.file = file;
    this.state = state;
  }

  get warnings():string[] { return [...this.notices]; }

  static async open(storagePath: string): Promise<PersistenceService> {
    await fs.mkdir(storagePath,{recursive:true});
    const file = join(storagePath,'devpilot-state.json');
    let state: StoreState,migrated=false;
    try { const decoded=decodeState(await fs.readFile(file,'utf8'));state=decoded.state;migrated=decoded.migrated; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      state = emptyState();
    }
    const store=new PersistenceService(file,state);
    if(migrated) await store.update(()=>{});
    await store.redactLegacyContent();
    return store;
  }

  async listConversations(workspace: string): Promise<ConversationSummary[]> {
    return this.state.conversations
      .filter(item => item.workspace === workspace)
      .sort((a,b) => b.updatedAt-a.updatedAt)
      .map(({id,title,updatedAt}) => ({id,title,updatedAt}));
  }

  async getConversation(workspace: string, id: string): Promise<ChatMessage[] | undefined> {
    const item = this.state.conversations.find(conversation => conversation.workspace === workspace && conversation.id === id);
    return item ? item.messages.map(message => ({...message})) : undefined;
  }

  async saveConversation(workspace: string, id: string, messages: ChatMessage[]): Promise<void> {
    if (!messages.length) return;
    await this.update(state => {
      const existing = state.conversations.find(item => item.workspace === workspace && item.id === id);
      const now = state.conversations.filter(item => item.workspace === workspace)
        .reduce((latest,item) => Math.max(latest,item.updatedAt+1),Date.now());
      const safeMessages=messages.slice(-40).map(message => ({role:message.role,content:redactSecrets(message.content).text}));
      const firstPrompt = safeMessages.find(message => message.role === 'user')?.content.trim().replace(/\s+/g,' ') ?? '';
      const title = firstPrompt.slice(0,80) || 'New conversation';
      const conversation: Conversation = {
        id,workspace,title:redactSecrets(title).text,createdAt:existing?.createdAt ?? now,updatedAt:now,
        messages:safeMessages,
      };
      if (existing) Object.assign(existing,conversation);
      else state.conversations.push(conversation);
      const workspaceItems = state.conversations
        .filter(item => item.workspace === workspace)
        .sort((a,b) => b.updatedAt-a.updatedAt);
      const retained = new Set(workspaceItems.slice(0,100).map(item => item.id));
      state.conversations = state.conversations.filter(item => item.workspace !== workspace || retained.has(item.id));
    });
  }

  async deleteConversation(workspace: string, id: string): Promise<void> {
    await this.update(state => {
      state.conversations = state.conversations.filter(item => item.workspace !== workspace || item.id !== id);
    });
  }

  async loadSemanticIndex(workspace: string, model: string): Promise<SemanticEntry[]> {
    return (this.state.indexes[JSON.stringify([workspace,model])] ?? []).map(entry => ({...entry,vector:[...entry.vector]}));
  }

  async saveSemanticIndex(workspace: string, model: string, entries: SemanticEntry[]): Promise<void> {
    await this.update(state => { state.indexes[JSON.stringify([workspace,model])] = entries.slice(0,48); });
  }

  async loadUndoRecords(workspace: string): Promise<UndoRecord[]> {
    return (this.state.undo[workspace] ?? []).map(record => ({...record}));
  }

  async saveUndoRecords(workspace: string, records: UndoRecord[]): Promise<number> {
    const bounded=records.slice(-20);
    const safe=bounded.filter(record => !containsSecrets(record.before ?? '') && !containsSecrets(record.after ?? ''));
    await this.update(state => { state.undo[workspace] = safe.map(record => ({...record})); });
    return bounded.length-safe.length;
  }

  async appendAuditEvent(event:Omit<AuditEvent,'id'|'timestamp'>):Promise<void> {
    const safe:Omit<AuditEvent,'id'|'timestamp'>={
      ...event,
      argsSummary:redactSecrets(event.argsSummary).text,
      resultSummary:redactSecrets(event.resultSummary).text,
      detail:event.detail ? redactSecrets(event.detail).text.slice(0,1000) : undefined,
    };
    await this.update(state=>{
      state.auditEvents.push({id:randomUUID(),timestamp:Date.now(),...safe});
      state.auditEvents=state.auditEvents.slice(-maxAuditEvents);
    });
  }

  async listAuditEvents():Promise<AuditEvent[]> {
    return this.state.auditEvents.map(event=>({...event}));
  }

  async clearAuditLog():Promise<void> {
    await this.update(state=>{state.auditEvents=[];});
  }

  private async redactLegacyContent():Promise<void> {
    let messagesRedacted=0,undoRecordsDropped=0;
    for(const conversation of this.state.conversations) {
      if(redactSecrets(conversation.title).count) messagesRedacted++;
      for(const message of conversation.messages) if(redactSecrets(message.content).count) messagesRedacted++;
    }
    for(const records of Object.values(this.state.undo)) {
      undoRecordsDropped+=records.filter(record => containsSecrets(record.before ?? '') || containsSecrets(record.after ?? '')).length;
    }
    if(!messagesRedacted && !undoRecordsDropped) return;
    await this.update(state => {
      for(const conversation of state.conversations) {
        conversation.title=redactSecrets(conversation.title).text;
        conversation.messages=conversation.messages.map(message => ({role:message.role,content:redactSecrets(message.content).text}));
      }
      for(const workspace of Object.keys(state.undo)) {
        state.undo[workspace]=state.undo[workspace].filter(record => !containsSecrets(record.before ?? '') && !containsSecrets(record.after ?? ''));
      }
    });
    if(messagesRedacted) this.notices.push(`Redacted detected credentials in ${messagesRedacted} saved conversation field(s).`);
    if(undoRecordsDropped) this.notices.push(`Removed ${undoRecordsDropped} saved undo record(s) containing detected credentials.`);
  }

  private async update(change: (state: StoreState) => void): Promise<void> {
    const operation = this.queue.then(async () => {
      const next = structuredClone(this.state);
      change(next);
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary,JSON.stringify(next),{encoding:'utf8',mode:0o600});
        await fs.rename(temporary,this.file);
      } catch(error) {
        try { await fs.unlink(temporary); }
        catch(cleanupError) {
          if((cleanupError as NodeJS.ErrnoException).code!=='ENOENT') {
            throw new AggregateError([error,cleanupError],'Persistent data could not be saved or temporary storage cleaned.');
          }
        }
        throw error;
      }
      this.state = next;
    });
    this.queue = operation.catch(() => undefined);
    await operation;
  }
}
