import * as vscode from 'vscode';
import { ChatViewProvider } from './providers/ChatViewProvider';
import { PersistenceService } from './services/PersistenceService';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const persistence = await PersistenceService.open(context.globalStorageUri.fsPath);
  for(const warning of persistence.warnings) void vscode.window.showWarningMessage(`DevPilot AI: ${warning}`);
  const auditChannel=vscode.window.createOutputChannel('DevPilot AI Audit');
  const provider = new ChatViewProvider(context.extensionUri,persistence);
  context.subscriptions.push(
    provider,
    auditChannel,
    vscode.commands.registerCommand('devpilot.indexWorkspace',() => provider.indexWorkspace()),
    vscode.commands.registerCommand('devpilot.reviewProject',async () => { await vscode.commands.executeCommand('devpilot.chat.focus'); await provider.reviewProject(); }),
    vscode.commands.registerCommand('devpilot.explainCode',async () => { await vscode.commands.executeCommand('devpilot.chat.focus'); await provider.editorTask('Explain the selected code.'); }),
    vscode.commands.registerCommand('devpilot.fixCode',async () => { await vscode.commands.executeCommand('devpilot.chat.focus'); await provider.editorTask('Diagnose this code and propose a fix plan.'); }),
    vscode.commands.registerCommand('devpilot.generateTests',async () => { await vscode.commands.executeCommand('devpilot.chat.focus'); await provider.editorTask('Propose tests for this code, inspecting the project test setup.'); }),
    vscode.commands.registerCommand('devpilot.revertChange',() => provider.revertLastChange()),
    vscode.commands.registerCommand('devpilot.showAuditLog',async()=>{
      auditChannel.clear();
      for(const event of await persistence.listAuditEvents()) {
        const detail=event.detail ? ` detail=${event.detail}` : '';
        auditChannel.appendLine(`${new Date(event.timestamp).toISOString()} task=${event.taskId} tool=${event.tool} approval=${event.approval} outcome=${event.outcome} args=${event.argsSummary} result=${event.resultSummary}${detail}`);
      }
      auditChannel.show(true);
    }),
    vscode.commands.registerCommand('devpilot.clearAuditLog',async()=>{
      const answer=await vscode.window.showWarningMessage('Clear the local DevPilot audit log? This cannot be undone.',{modal:true},'Clear audit log');
      if(answer==='Clear audit log') { await persistence.clearAuditLog();auditChannel.clear();void vscode.window.showInformationMessage('DevPilot audit log cleared.'); }
    }),
    vscode.window.registerWebviewViewProvider('devpilot.chat', provider),
    vscode.commands.registerCommand('devpilot.openChat', () => vscode.commands.executeCommand('devpilot.chat.focus')),
    vscode.commands.registerCommand('devpilot.newConversation', async () => {
      await vscode.commands.executeCommand('devpilot.chat.focus');
      provider.reset();
    }),
    vscode.commands.registerCommand('devpilot.openSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:devpilot.devpilot-ai')),
  );
}
