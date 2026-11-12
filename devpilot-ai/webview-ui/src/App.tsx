import { useEffect, useRef, useState } from 'react';
import { Code2, Plus, Settings, RefreshCw, Send, Square } from 'lucide-react';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import type { ChatMessage } from '../../src/types';

declare function acquireVsCodeApi(): { postMessage(value: unknown): void; getState(): unknown; setState(value: unknown): void };
const vscode = acquireVsCodeApi();
const saved = vscode.getState();
const initialDraft = saved && typeof saved === 'object' && 'draft' in saved && typeof saved.draft === 'string' ? saved.draft : '';
interface State { approval?:{id:string;title:string;action:string}; messages: ChatMessage[]; models: string[]; model: string; error: string; connected: boolean; busy: boolean; trusted: boolean; mode:'chat'|'plan'|'agent'; timeline:{name:string;status:string}[]; canExecutePlan:boolean; usage?: {prompt?: number; completion?: number} }
const initial: State = {messages:[],models:[],model:'',error:'',connected:false,busy:false,trusted:false,mode:'chat',timeline:[],canExecutePlan:false};
function CodeBlock({children}: {children?: React.ReactNode}) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied,setCopied] = useState(false);
  return <div className="code-block"><button onClick={() => { void navigator.clipboard.writeText(ref.current?.textContent ?? '').then(() => setCopied(true)).catch(() => setCopied(false)); }} aria-label="Copy code">{copied ? 'Copied' : 'Copy'}</button><pre ref={ref}>{children}</pre></div>;
}
export function App() {
  const [draft,setDraft] = useState(initialDraft);
  const [state,setState] = useState<State>(initial);
  const [notice,setNotice] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.data?.type === 'state') setState(event.data);
      if (event.data?.type === 'reset') { setDraft(''); setNotice('New conversation ready.'); }
    };
    window.addEventListener('message',receive); vscode.postMessage({type:'ready'});
    return () => window.removeEventListener('message',receive);
  },[]);
  useEffect(() => { vscode.setState({draft}); },[draft]);
  useEffect(() => { bottom.current?.scrollIntoView({block:'end'}); },[state.messages]);
  const send = () => {
    if (!draft.trim() || state.busy || !state.connected || !state.model) return;
    vscode.postMessage({type:'send',text:draft}); setDraft(''); setNotice('');
  };
  return <main className="flex h-screen flex-col">
    <header className="flex items-center gap-3 border-b p-4"><Code2 size={23}/><div className="brand">DevPilot <span>AI</span></div><div className="grow"/><button title="New conversation" aria-label="New conversation" onClick={() => vscode.postMessage({type:'newConversation'})}><Plus size={17}/></button><button title="Open settings" aria-label="Open settings" onClick={() => vscode.postMessage({type:'openSettings'})}><Settings size={17}/></button></header>
    <div className="model-row"><span className={'dot ' + (state.connected ? 'online' : '')}/><label htmlFor="model" className="sr-only">Local model</label><select id="model" value={state.model} disabled={state.busy || !state.models.length} onChange={e => vscode.postMessage({type:'selectModel',model:e.target.value})}>{!state.models.length && <option value="">No models connected</option>}{state.models.map(model => <option key={model}>{model}</option>)}</select><button title="Refresh Ollama connection" aria-label="Refresh Ollama connection" disabled={state.busy} onClick={() => vscode.postMessage({type:'refresh'})}><RefreshCw size={15}/></button></div>
    <section className="welcome grow" aria-label="Conversation">
      {!state.messages.length && <><div className="emblem"><Code2 size={30}/></div><p className="eyebrow">YOUR LOCAL CODING COMPANION</p><h1>Build on your<br/>own terms.</h1><p className="muted">Your Code. Your Machine. Your AI.</p><div className="card"><div><strong>Local chat is ready</strong><p>Start Ollama, refresh the connection and choose an installed model. Ask in Hindi or English. Choose Plan to inspect the workspace, or Agent to propose approved changes. All commands require approval.</p></div></div><p className="privacy">Chat sends messages only. Plan/Agent can retrieve allowed project files for local Ollama. No telemetry.</p></>}
      {state.messages.map((message,index) => <article className={'message ' + message.role} key={index}><strong>{message.role === 'user' ? 'You' : 'DevPilot AI'}</strong><Markdown rehypePlugins={[rehypeHighlight]} components={{pre:CodeBlock,a:({children}) => <span>{children}</span>,img:({alt}) => <span>{alt}</span>}}>{message.content || (state.busy ? 'Generating...' : '(No response content)')}</Markdown></article>)}
      {state.timeline.length > 0 && <details className="timeline" open><summary>Task activity</summary>{state.timeline.map((event,index) => <div key={index}><strong>{event.name}</strong><span>{event.status}</span></div>)}</details>}
      <div ref={bottom}/>
    </section>
    <footer className="p-4"><div className="mode-row"><label htmlFor="mode">Mode</label><select id="mode" value={state.mode} disabled={state.busy} onChange={e => vscode.postMessage({type:'setMode',mode:e.target.value})}><option value="chat">Chat</option><option value="plan">Plan (read only)</option><option value="agent">Agent (approved tools)</option></select></div>{state.canExecutePlan && !state.busy && <button className="execute-plan" onClick={() => vscode.postMessage({type:'executePlan'})}>Execute plan in Agent mode</button>}{state.error && <div className="error" role="alert">{state.error}</div>}{state.approval && <div className="approval" role="region" aria-label="Approval required"><strong>Approval required</strong><pre>{state.approval.title}</pre><div className="actions"><button onClick={() => vscode.postMessage({type:'approval',id:state.approval!.id,approved:false})}>Reject</button><button onClick={() => vscode.postMessage({type:'approval',id:state.approval!.id,approved:true})}>{state.approval.action}</button></div></div>}<div className="composer"><label htmlFor="draft">Message</label><textarea id="draft" maxLength={16000} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} placeholder="Ask anything... Hindi or English" rows={3}/><div className="actions"><span>Enter to send / Shift+Enter for newline</span>{state.busy ? <button aria-label="Stop generation" onClick={() => vscode.postMessage({type:'stop'})}><Square size={16}/> Stop</button> : <button aria-label="Send message" disabled={!draft.trim() || !state.connected || !state.model} onClick={send}><Send size={16}/> Send</button>}</div></div><div className="status"><span>{state.connected ? 'Ollama connected' : 'Ollama disconnected'}</span><span>{state.mode === 'chat' ? 'Local chat' : state.trusted ? 'Trusted tools' : 'Tools require trust'}</span></div>{state.messages.length > 0 && <button disabled={state.busy || !state.connected} onClick={() => vscode.postMessage({type:'regenerate'})}>Regenerate last response</button>}{state.usage && <p className="privacy">Tokens: {state.usage.prompt ?? '?'} input / {state.usage.completion ?? '?'} output</p>}<div role="status" aria-live="polite">{state.busy ? 'Generating response...' : notice}</div></footer>
  </main>;
}
