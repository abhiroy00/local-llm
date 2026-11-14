import {expect,it,vi} from 'vitest';
import type * as vscode from 'vscode';
import {workspace} from './vscode.mock';
import {ChatViewProvider} from '../src/providers/ChatViewProvider';
import {OllamaService} from '../src/services/OllamaService';
import type {ChatMessage} from '../src/types';
function chatFixture() {
  Object.assign(workspace,{getConfiguration:()=>({get:(_key:string,fallback:unknown)=>fallback})});
  const provider=new ChatViewProvider({} as vscode.Uri);
  const service=new OllamaService('http://localhost:11434');
  const state=provider as unknown as {connected:boolean;models:string[];model:string;mode:'chat';service:()=>OllamaService;generate:(text:string)=>Promise<void>;messages:ChatMessage[];error:string;view:unknown};
  const postMessage=vi.fn();state.view={webview:{postMessage}};
  state.connected=true;state.models=['fixture'];state.model='fixture';state.mode='chat';state.service=()=>service;
  return {provider,service,state,postMessage};
}
it('publishes a useful incomplete response instead of an empty assistant message on failure',async()=>{
  const {provider,service,state,postMessage}=chatFixture();
  vi.spyOn(service,'chat').mockRejectedValue(new Error('Fixture transport failed'));
  try {
    await state.generate('hello');expect(state.messages.at(-1)?.content).toContain('Task incomplete: Fixture transport failed');
    expect(state.error).toBe('Fixture transport failed');
    expect(postMessage.mock.lastCall?.[0].messages.at(-1).content).not.toBe('');
  } finally {provider.dispose();}
});
it('retains a partial response when transport fails after streaming began',async()=>{
  const {provider,service,state}=chatFixture();
  vi.spyOn(service,'chat').mockImplementation(async(_model,_messages,_limit,_signal,onText)=>{onText('Partial answer');throw new Error('Connection lost');});
  try {await state.generate('hello');expect(state.messages.at(-1)?.content).toBe('Partial answer');expect(state.error).toBe('Connection lost');}
  finally {provider.dispose();}
});

it('runs direct test verification without a model and waits for approval',async()=>{
  const {provider,service,state}=chatFixture();
  const internals=provider as unknown as {mode:string;connected:boolean;getTools:()=>unknown;approvals:{pending?:{id:string};request:(title:string,action:string,signal:AbortSignal)=>Promise<boolean>;respond:(id:string,approved:boolean)=>void}};
  internals.mode='agent';internals.connected=false;
  const structured=vi.spyOn(service,'structured');const chat=vi.spyOn(service,'chat');
  const execute=vi.fn(async(_name:string,_input:unknown,_mode:string,signal:AbortSignal)=>{
    const approved=await internals.approvals.request('Run npm test in fixture?','Run command',signal);
    return approved?{exitCode:0,output:'2 tests passed'}:{approved:false};
  });internals.getTools=()=>({execute});
  try {
    const pending=provider.runNpmTests();expect(internals.approvals.pending?.id).toBeDefined();
    internals.approvals.respond(internals.approvals.pending!.id,true);await pending;
    expect(execute).toHaveBeenCalledWith('run_tests',{runner:'npm'},'agent',expect.any(AbortSignal));expect(state.messages.at(-1)?.content).toContain('npm test exited 0');expect(structured).not.toHaveBeenCalled();expect(chat).not.toHaveBeenCalled();
  } finally {provider.dispose();}
});
it('does not bypass Plan restrictions or a rejected direct-test approval',async()=>{
  const {provider,state}=chatFixture();const internal=provider as unknown as {mode:string;getTools:()=>unknown};
  const execute=vi.fn().mockResolvedValue({approved:false});internal.getTools=()=>({execute});
  try {
    internal.mode='plan';await provider.runNpmTests();expect(execute).not.toHaveBeenCalled();expect(state.error).toContain('Switch to Agent');
    internal.mode='agent';await provider.runNpmTests();expect(state.messages.at(-1)?.content).toContain('not executed because approval was rejected');
  } finally {provider.dispose();}
});
it('reports a failing test exit without claiming the tests passed',async()=>{
  const {provider,state}=chatFixture();const internal=provider as unknown as {mode:string;getTools:()=>unknown};internal.mode='agent';internal.getTools=()=>({execute:vi.fn().mockResolvedValue({exitCode:1,output:'failed'})});
  try {await provider.runNpmTests();expect(state.messages.at(-1)?.content).toContain('npm test exited 1');expect(state.messages.at(-1)?.content).not.toContain('tests passed');}
  finally {provider.dispose();}
});
