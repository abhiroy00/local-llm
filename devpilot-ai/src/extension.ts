import {runtimeBuild} from './types/runtime';
import * as vscode from 'vscode';
import { ChatViewProvider } from './providers/ChatViewProvider';
import { PersistenceService } from './services/PersistenceService';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const persistence = await PersistenceService.open(context.globalStorageUri.fsPath);
  const provider = new ChatViewProvider(context.extensionUri,persistence,context.globalState,{...runtimeBuild,mode:context.extensionMode===vscode.ExtensionMode.Development?'development':context.extensionMode===vscode.ExtensionMode.Test?'test':'installed'});
  context.subscriptions.push(
    provider,
    vscode.commands.registerCommand('devpilot.reviewTask',()=>provider.reviewLatestTask()),
    vscode.commands.registerCommand('devpilot.undoTask',async()=>{await vscode.commands.executeCommand('devpilot.chat.focus');await provider.undoLatestTask();}),
    vscode.commands.registerCommand('devpilot.startDev',async()=>{await vscode.commands.executeCommand('devpilot.chat.focus');await provider.startProcess('dev');}),
    vscode.commands.registerCommand('devpilot.runNpmTests',async()=>{await vscode.commands.executeCommand('devpilot.chat.focus');await provider.runNpmTests();}),
    vscode.commands.registerCommand('devpilot.showRuntime',()=>vscode.window.showInformationMessage(`DevPilot ${runtimeBuild.version} · build ${runtimeBuild.build} · ${context.extensionMode===vscode.ExtensionMode.Development?'development host':'installed extension'}`)),
    vscode.commands.registerCommand('devpilot.setupModels',async()=>{await vscode.commands.executeCommand('devpilot.chat.focus');provider.openModelSetup();}),
    vscode.commands.registerCommand('devpilot.attachFile',()=>provider.attachFile()),
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
