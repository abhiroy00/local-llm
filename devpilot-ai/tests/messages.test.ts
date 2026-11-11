import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/types';
describe('webview message boundary', () => {
  it('accepts supported actions', () => {
    for (const type of ['ready','newConversation','openSettings']) expect(parseClientMessage({type})).toEqual({type});
  });
  it('rejects malformed or unapproved actions', () => {
    for (const value of [null,undefined,'ready',{}, {type: 1},{type:'run_terminal'},{type:'edit_file'}]) expect(parseClientMessage(value)).toBeUndefined();
  });
});
