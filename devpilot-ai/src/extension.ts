import * as vscode from 'vscode';
import { ChatViewProvider } from './providers/ChatViewProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    provider,
    vscode.commands.registerCommand('devpilot.indexWorkspace',() => provider.indexWorkspace()),
    vscode.commands.registerCommand('devpilot.reviewProject',async () => { await vscode.commands.executeCommand('devpilot.chat.focus'); await provider.reviewProject(); }),
    vscode.commands.registerCommand('devpilot.explainCode',async () => { await vscode.commands.executeCommand('devpilot.chat.focus'); await provider.editorTask('Explain the selected code.'); }),
    vscode.commands.registerCommand('devpilot.fixCode',async () => { await vscode.commands.executeCommand('devpilot.chat.focus'); await provider.editorTask('Diagnose this code and propose a fix plan.'); }),
    vscode.commands.registerCommand('devpilot.generateTests',async () => { await vscode.commands.executeCommand('devpilot.chat.focus'); await provider.editorTask('Propose tests for this code, inspecting the project test setup.'); }),
    vscode.commands.registerCommand('devpilot.revertChange',() => provider.revertLastChange()),
    vscode.window.registerWebviewViewProvider('devpilot.chat', provider),
    vscode.commands.registerCommand('devpilot.openChat', () => vscode.commands.executeCommand('devpilot.chat.focus')),
    vscode.commands.registerCommand('devpilot.newConversation', async () => {
      await vscode.commands.executeCommand('devpilot.chat.focus');
      provider.reset();
    }),
    vscode.commands.registerCommand('devpilot.openSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:devpilot.devpilot-ai')),
  );
}
