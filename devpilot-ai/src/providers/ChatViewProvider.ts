import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { parseClientMessage } from '../types';

export class ChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private listeners: vscode.Disposable[] = [];
  constructor(private readonly extensionUri: vscode.Uri) {}
  resolveWebviewView(view: vscode.WebviewView): void {
    this.listeners.forEach(item => item.dispose());
    this.listeners = [];
    this.view = view;
    const root = vscode.Uri.joinPath(this.extensionUri, 'dist');
    view.webview.options = { enableScripts: true, localResourceRoots: [root] };
    const nonce = randomBytes(24).toString('hex');
    const script = view.webview.asWebviewUri(vscode.Uri.joinPath(root, 'webview.js'));
    const style = view.webview.asWebviewUri(vscode.Uri.joinPath(root, 'webview.css'));
    view.webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${view.webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${view.webview.cspSource};"><link href="${style}" rel="stylesheet"><title>DevPilot AI</title></head><body><div id="root"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
    this.listeners.push(view.webview.onDidReceiveMessage((raw: unknown) => {
      const message = parseClientMessage(raw);
      if (!message) return;
      if (message.type === 'openSettings') void vscode.commands.executeCommand('devpilot.openSettings');
      if (message.type === 'newConversation') this.reset();
      if (message.type === 'ready') void view.webview.postMessage({type:'status',trusted:vscode.workspace.isTrusted});
    }));
    this.listeners.push(vscode.workspace.onDidGrantWorkspaceTrust(() => void view.webview.postMessage({type:'status',trusted:true})));
  }
  reset(): void { void this.view?.webview.postMessage({type:'reset'}); }
  dispose(): void { this.listeners.forEach(item => item.dispose()); this.listeners = []; }
}
