import { useEffect, useRef, useState } from 'react';
import { FlaskConical, Cpu, Code2, Plus, Settings, RefreshCw, ArrowUp, Square, Trash2, Paperclip, X, Undo2, FolderSearch, ChevronDown, Check, Circle, LoaderCircle } from 'lucide-react';
import {WorkspacePanel} from './WorkspacePanel';
import type {CheckpointSummary,JobSummary} from '../../src/types/workspace';
import {ModelSetup} from './ModelSetup';
import type {HardwareInfo} from '../../src/models/ModelCatalog';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import type {RuntimeInfo} from '../../src/types/runtime';
import type { ChatMessage } from '../../src/types';

declare function acquireVsCodeApi(): { postMessage(value: unknown): void; getState(): unknown; setState(value: unknown): void };
const vscode = acquireVsCodeApi();
const saved = vscode.getState();
const initialDraft = saved && typeof saved === 'object' && 'draft' in saved && typeof saved.draft === 'string' ? saved.draft : '';
interface State {
  checkpoints:CheckpointSummary[];jobs:JobSummary[];runtime?:RuntimeInfo;inferenceProfile?:'low-memory'|'balanced';hardware?:HardwareInfo;modelSetupVisible?:boolean;download?:{profileId:string;status:string;percent?:number};
  approval?:{id:string;title:string;action:string}; messages:ChatMessage[]; models:string[]; model:string;
  error:string; connected:boolean; busy:boolean; trusted:boolean; mode:'chat'|'plan'|'agent';
  timeline:{name:string;status:string;detail?:string}[]; canExecutePlan:boolean;
  usage?:{prompt?:number;completion?:number}; conversations:{id:string;title:string;updatedAt:number}[];
  activeConversationId?:string; attachments:string[]; workspaceName:string;
  planSteps:{title:string;status:'pending'|'in_progress'|'completed'}[];
}
const initial:State={checkpoints:[],jobs:[],messages:[],models:[],model:'',error:'',connected:false,busy:false,trusted:false,mode:'agent',timeline:[],canExecutePlan:false,conversations:[],attachments:[],workspaceName:'Workspace',planSteps:[]};
function CodeBlock({children}:{children?:React.ReactNode}) {
  const ref=useRef<HTMLPreElement>(null);
  const [copied,setCopied]=useState(false);
  return <div className="code-block"><button onClick={()=>{void navigator.clipboard.writeText(ref.current?.textContent ?? '').then(()=>setCopied(true)).catch(()=>setCopied(false));}} aria-label="Copy code">{copied?'Copied':'Copy'}</button><pre ref={ref}>{children}</pre></div>;
}
function Activity({events}: {events:State['timeline']}) {
  if(!events.length) return null;
  return <details className="activity" open><summary><ChevronDown size={13}/> Task activity <span>{events.length}</span></summary>{events.map((event,index)=><div className={'activity-row '+event.status} key={index}><div><span className="activity-dot"/><strong>{event.name.replaceAll('_',' ')}</strong><span>{event.status}</span></div>{event.detail && <details><summary>View output</summary><pre>{event.detail}</pre></details>}</div>)}</details>;
}
export function App() {
  const [draft,setDraft]=useState(initialDraft);
  const [state,setState]=useState<State>(initial);
  const [notice,setNotice]=useState('');
  const bottom=useRef<HTMLDivElement>(null);
  const scroll=useRef<HTMLElement>(null);
  const following=useRef(true);
  const input=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{
    const receive=(event:MessageEvent)=>{
      if(event.data?.type==='state') setState(event.data);
      if(event.data?.type==='reset') {setDraft('');setNotice('New conversation ready.');input.current?.focus();}
    };
    window.addEventListener('message',receive);vscode.postMessage({type:'ready'});
    return ()=>window.removeEventListener('message',receive);
  },[]);
  useEffect(()=>{vscode.setState({draft});},[draft]);
  useEffect(()=>{if(following.current && (state.messages.length>0 || state.timeline.length>0 || state.planSteps.length>0)) bottom.current?.scrollIntoView({block:'end'});},[state.messages,state.timeline,state.planSteps]);
  useEffect(()=>{if(state.modelSetupVisible) {scroll.current?.scrollTo({top:0});following.current=false;}},[state.modelSetupVisible]);
  const send=()=>{
    if(!draft.trim() || state.busy || !state.connected || !state.model) return;
    following.current=true;vscode.postMessage({type:'send',text:draft});setDraft('');setNotice('');
  };
  const starter=(text:string)=>{setDraft(text);input.current?.focus();};
  return <main className="agent-shell">
    <header className="agent-header"><div className="identity"><Code2 size={19}/><strong>DevPilot</strong><span className="local-badge">LOCAL</span></div><div className="header-actions"><button title="Set up free DeepSeek models" aria-label="Set up DeepSeek models" onClick={()=>vscode.postMessage({type:'openModelSetup'})}><Cpu size={17}/></button><button title="New conversation" aria-label="New conversation" disabled={state.busy} onClick={()=>vscode.postMessage({type:'newConversation'})}><Plus size={17}/></button><button title="Open settings" aria-label="Open settings" onClick={()=>vscode.postMessage({type:'openSettings'})}><Settings size={16}/></button></div></header>
    <div className="session-bar"><span className="workspace-label" title={state.workspaceName}>{state.workspaceName}</span><select aria-label="Saved conversations" value={state.activeConversationId ?? ''} disabled={state.busy} onChange={event=>{if(event.target.value) vscode.postMessage({type:'selectConversation',id:event.target.value});}}><option value="">New session</option>{state.conversations.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select><button title="Delete conversation" aria-label="Delete conversation" disabled={state.busy || !state.activeConversationId} onClick={()=>vscode.postMessage({type:'deleteConversation',id:state.activeConversationId})}><Trash2 size={14}/></button></div>
    <section className="conversation" aria-label="Conversation" ref={scroll} onScroll={()=>{const el=scroll.current;if(el) following.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}}>
      {state.modelSetupVisible && <ModelSetup inferenceProfile={state.inferenceProfile ?? 'low-memory'} models={state.models} connected={state.connected} busy={state.busy} hardware={state.hardware} download={state.download} post={message=>vscode.postMessage(message)}/>}
      {!state.messages.length && <div className="empty-state"><div className="emblem"><Code2 size={28}/></div><p className="eyebrow">YOUR WORKSPACE. YOUR MODEL.</p><h1>What are we<br/>building today?</h1><p>Explore a codebase, implement a feature, or track down a bug. Review changes as you go.</p><div className="starters"><button onClick={()=>starter('Inspect this project and explain its architecture. Start with README and AGENTS.md.')}>Explore this project <span>↗</span></button><button onClick={()=>starter('Inspect compiler diagnostics, find the underlying problems, propose fixes and run relevant tests.')}>Fix project problems <span>↗</span></button><button onClick={()=>starter('Inspect the test setup and add meaningful tests for uncovered behavior. Run the tests and report results.')}>Add useful tests <span>↗</span></button></div><p className="privacy">Powered by local Ollama · Changes and commands require approval.</p></div>}
      {state.messages.map((message,index)=><article className={'message '+message.role} key={index}><div className="message-author">{message.role==='user'?'You':'DevPilot'}{message.role==='assistant' && <span>local agent</span>}</div><Markdown rehypePlugins={[rehypeHighlight]} components={{pre:CodeBlock,a:({children})=><span>{children}</span>,img:({alt})=><span>{alt}</span>}}>{message.content || (state.busy?'Working on your request…':'(No response content)')}</Markdown></article>)}
      {state.planSteps.length>0 && <section className="task-plan" aria-label="Task plan"><strong>Plan <span>{state.planSteps.filter(step=>step.status==='completed').length}/{state.planSteps.length}</span></strong><ol>{state.planSteps.map((step,index)=><li key={index} className={step.status}>{step.status==='completed'?<Check size={14}/>:step.status==='in_progress'?<LoaderCircle size={14} className="spinning"/>:<Circle size={14}/>}<span>{step.title}</span></li>)}</ol></section>}
      <WorkspacePanel checkpoints={state.checkpoints ?? []} jobs={state.jobs ?? []} busy={state.busy} agent={state.mode==='agent'} trusted={state.trusted} post={message=>vscode.postMessage(message)}/>
      <Activity events={state.timeline}/><div ref={bottom}/>
    </section>
    <footer className="agent-footer">
      {state.error && <div className="error" role="alert">{state.error}</div>}
      {state.approval && <section className="approval" aria-label="Approval required"><strong>Review required</strong><pre>{state.approval.title}</pre><div className="approval-actions"><button onClick={()=>vscode.postMessage({type:'approval',id:state.approval!.id,approved:false})}>Reject</button><button className="primary" onClick={()=>vscode.postMessage({type:'approval',id:state.approval!.id,approved:true})}>{state.approval.action}</button></div></section>}
      {state.canExecutePlan && !state.busy && <button className="execute-plan primary" onClick={()=>vscode.postMessage({type:'executePlan'})}>Execute plan <ArrowUp size={14}/></button>}
      <div className="composer">
        {state.attachments.length>0 && <div className="attachments">{state.attachments.map(file=><span key={file} title={file}><Paperclip size={12}/><span>{file}</span><button aria-label={'Remove '+file} disabled={state.busy} onClick={()=>vscode.postMessage({type:'removeAttachment',path:file})}><X size={12}/></button></span>)}</div>}
        <label className="sr-only" htmlFor="draft">Message</label><textarea ref={input} id="draft" maxLength={16000} value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {event.preventDefault();send();}}} placeholder="Ask DevPilot to build something…" rows={3}/>
        <div className="composer-toolbar"><button aria-label="Attach project files" title="Attach project files" disabled={state.busy || state.attachments.length>=4} onClick={()=>vscode.postMessage({type:'attachFile'})}><Paperclip size={16}/></button><select aria-label="Agent mode" value={state.mode} disabled={state.busy} onChange={event=>vscode.postMessage({type:'setMode',mode:event.target.value})}><option value="agent">Agent</option><option value="plan">Plan</option><option value="chat">Chat</option></select><span className="toolbar-spacer"/>{state.busy?<button className="send-button stop" aria-label="Stop generation" title="Stop" onClick={()=>vscode.postMessage({type:'stop'})}><Square size={14}/></button>:<button className="send-button" aria-label="Send message" title="Send message" disabled={!draft.trim() || !state.connected || !state.model} onClick={send}><ArrowUp size={18}/></button>}</div>
      </div>
      <div className="model-toolbar"><span className={'dot '+(state.connected?'online':'')}/><select aria-label="Local model" value={state.model} disabled={state.busy || !state.models.length} onChange={event=>vscode.postMessage({type:'selectModel',model:event.target.value})}>{!state.models.length && <option value="">Connect Ollama to begin</option>}{state.models.map(model=><option key={model}>{model}</option>)}</select><button title="Refresh models" aria-label="Refresh Ollama connection" disabled={state.busy} onClick={()=>vscode.postMessage({type:'refresh'})}><RefreshCw size={13}/></button><button title="Run npm tests with approval" aria-label="Run npm tests" disabled={state.busy || state.mode!=='agent'} onClick={()=>vscode.postMessage({type:'runNpmTests'})}><FlaskConical size={14}/></button><button title="Index workspace" aria-label="Index workspace" disabled={state.busy} onClick={()=>vscode.postMessage({type:'indexWorkspace'})}><FolderSearch size={14}/></button><button title="Revert last approved change" aria-label="Revert last change" disabled={state.busy} onClick={()=>vscode.postMessage({type:'revertChange'})}><Undo2 size={14}/></button></div>
      <div className="footer-status"><span>{state.busy?'Working…':state.mode==='chat'?'Chat · messages only':state.trusted?'Workspace tools · approval required':'Open a trusted folder to use tools'}</span>{state.messages.length>0 && <button disabled={state.busy || !state.connected} onClick={()=>vscode.postMessage({type:'regenerate'})}>Retry</button>}</div>
      {state.runtime && <div className="runtime-stamp" title={'Build '+state.runtime.build}>DevPilot {state.runtime.version} · {state.runtime.mode} · {state.runtime.build}</div>}
      {state.usage && <div className="token-usage">{state.usage.prompt ?? '?'} input · {state.usage.completion ?? '?'} output tokens</div>}<div className="sr-only" role="status" aria-live="polite">{state.busy?'Generating response':notice}</div>
    </footer>
  </main>;
}
