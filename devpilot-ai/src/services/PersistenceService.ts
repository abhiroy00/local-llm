import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { ChatMessage } from '../types';

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

interface Conversation extends ConversationSummary {
  workspace: string;
  createdAt: number;
  messages: ChatMessage[];
}

interface StoreState {
  version: 1;
  conversations: Conversation[];
  indexes: Record<string, SemanticEntry[]>;
  undo: Record<string, UndoRecord[]>;
}

const emptyState = (): StoreState => ({version:1,conversations:[],indexes:{},undo:{}});
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function decodeState(raw: string): StoreState {
  const parsed: unknown = JSON.parse(raw);
  if (!isObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.conversations) || !isObject(parsed.indexes) || !isObject(parsed.undo)) {
    throw new Error('Persistent data format is invalid or unsupported.');
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
  return parsed as unknown as StoreState;
}

export function workspaceKey(root: string): string {
  const normalized=root.replace(/\\/g,'/');
  return createHash('sha256').update(process.platform==='win32' ? normalized.toLowerCase() : normalized).digest('hex');
}

export class PersistenceService {
  private readonly file: string;
  private state: StoreState;
  private queue: Promise<void> = Promise.resolve();

  private constructor(file: string, state: StoreState) {
    this.file = file;
    this.state = state;
  }

  static async open(storagePath: string): Promise<PersistenceService> {
    await fs.mkdir(storagePath,{recursive:true});
    const file = join(storagePath,'devpilot-state.json');
    let state: StoreState;
    try { state = decodeState(await fs.readFile(file,'utf8')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      state = emptyState();
    }
    return new PersistenceService(file,state);
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
      const firstPrompt = messages.find(message => message.role === 'user')?.content.trim().replace(/\s+/g,' ') ?? '';
      const title = firstPrompt.slice(0,80) || 'New conversation';
      const conversation: Conversation = {
        id,workspace,title,createdAt:existing?.createdAt ?? now,updatedAt:now,
        messages:messages.slice(-40).map(message => ({role:message.role,content:message.content})),
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

  async saveUndoRecords(workspace: string, records: UndoRecord[]): Promise<void> {
    await this.update(state => { state.undo[workspace] = records.slice(-20).map(record => ({...record})); });
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
