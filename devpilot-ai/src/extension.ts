import * as vscode from 'vscode';
import { ChatViewProvider } from './providers/ChatViewProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    provider,
    vscode.window.registerWebviewViewProvider('devpilot.chat', provider),
    vscode.commands.registerCommand('devpilot.openChat', () => vscode.commands.executeCommand('devpilot.chat.focus')),
    vscode.commands.registerCommand('devpilot.newConversation', async () => {
      await vscode.commands.executeCommand('devpilot.chat.focus');
      provider.reset();
    }),
    vscode.commands.registerCommand('devpilot.openSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:devpilot.devpilot-ai')),
  );
}
