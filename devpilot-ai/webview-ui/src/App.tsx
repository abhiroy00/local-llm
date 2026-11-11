import { useEffect, useState } from 'react';
import { Code2, Plus, Settings, ShieldCheck } from 'lucide-react';

declare function acquireVsCodeApi(): { postMessage(value: unknown): void; getState(): unknown; setState(value: unknown): void };
const vscode = acquireVsCodeApi();
const saved = vscode.getState();
const initialDraft = saved && typeof saved === 'object' && 'draft' in saved && typeof saved.draft === 'string' ? saved.draft : '';

export function App() {
  const [draft, setDraft] = useState(initialDraft);
  const [trusted, setTrusted] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.data?.type === 'reset') { setDraft(''); setNotice('New conversation ready.'); }
      if (event.data?.type === 'status') setTrusted(event.data.trusted === true);
    };
    window.addEventListener('message', receive);
    vscode.postMessage({type:'ready'});
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => { vscode.setState({draft}); }, [draft]);
  return <main className="flex h-screen flex-col">
    <header className="flex items-center gap-3 border-b p-4"><Code2 size={23}/><div className="brand">DevPilot <span>AI</span></div><div className="grow"/><button title="New conversation" aria-label="New conversation" onClick={() => vscode.postMessage({type:'newConversation'})}><Plus size={17}/></button><button title="Open settings" aria-label="Open settings" onClick={() => vscode.postMessage({type:'openSettings'})}><Settings size={17}/></button></header>
    <div className="model-row"><span className="dot"/>Ollama integration · upcoming</div>
    <section className="welcome grow"><div className="emblem"><Code2 size={30}/></div><p className="eyebrow">YOUR LOCAL CODING COMPANION</p><h1>Build on your<br/>own terms.</h1><p className="muted">Your Code. Your Machine. Your AI.</p><div className="card"><ShieldCheck size={18}/><div><strong>Foundation ready</strong><p>The extension shell is installed. Local chat, workspace tools and approvals will arrive in the next development phases.</p></div></div><p className="privacy">No telemetry. No model downloads. No inference requests in this version.</p></section>
    <footer className="p-4"><div className="composer"><label htmlFor="draft">Task draft</label><textarea id="draft" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Describe your next task… Hindi or English" rows={3}/><p>Draft saved locally in this view. Sending becomes available with Ollama integration.</p></div><div className="status"><span>{trusted ? 'Trusted workspace' : 'Restricted workspace'}</span><span>Phase 1 · v0.1</span></div><div role="status" aria-live="polite">{notice}</div></footer>
  </main>;
}
