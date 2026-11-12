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
});
