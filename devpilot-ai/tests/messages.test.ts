import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/types';
describe('webview message boundary', () => {
  it('accepts supported actions', () => {
    for (const type of ['ready','newConversation','openSettings']) expect(parseClientMessage({type})).toEqual({type});
  });
  it('rejects malformed or unapproved actions', () => {
    for (const value of [null,undefined,'ready',{}, {type: 1},{type:'run_terminal'},{type:'edit_file'}]) expect(parseClientMessage(value)).toBeUndefined();
  });
  it('validates chat payloads and bounds prompt sizes', () => {
    expect(parseClientMessage({type:'send',text:' hello '})).toEqual({type:'send',text:'hello'});
    for (const text of ['', '  ', 'a'.repeat(16001), 123]) expect(parseClientMessage({type:'send',text})).toBeUndefined();
    expect(parseClientMessage({type:'selectModel',model:'local:test'})).toEqual({type:'selectModel',model:'local:test'});
    expect(parseClientMessage({type:'selectModel',model:1})).toBeUndefined();
  });
  it('validates saved conversation actions', () => {
    const id='00000000-0000-4000-8000-000000000000';
    expect(parseClientMessage({type:'selectConversation',id})).toEqual({type:'selectConversation',id});
    expect(parseClientMessage({type:'deleteConversation',id})).toEqual({type:'deleteConversation',id});
    expect(parseClientMessage({type:'deleteConversation',id:'not-a-uuid'})).toBeUndefined();
  });
});
