// [SCOPE] CHASSIS Chat Panel WebView provider — sidebar chat interface with Gemini integration

import * as vscode from 'vscode';
import { ChassisService } from '../services/chassisService.js';
import { RoutingService } from '../services/routingService.js';
import { getNonce } from './getNonce.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tokens?: number;
  cost?: number;
}

interface ChatPanelState {
  conversation: ChatMessage[];
  blueprintContext?: string;
}

export class ChatPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'chatPanel';
  private _view?: vscode.WebviewView;
  private state: ChatPanelState = {
    conversation: [],
    blueprintContext: '',
  };

  constructor(
    private chassis: ChassisService,
    private routing: RoutingService,
    private context: vscode.ExtensionContext
  ) {
    this.loadBlueprintContext();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.onDidChangeVisibility(async () => {
      if (webviewView.visible) {
        this.refresh();
      }
    });

    webviewView.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));
    this.refresh();
  }

  private loadBlueprintContext(): void {
    if (!this.chassis.isInitialized()) {
      this.state.blueprintContext = '';
      return;
    }
    const config = this.chassis.loadConfig();
    if (!config?.blueprint) {
      this.state.blueprintContext = '';
      return;
    }
    const bp = config.blueprint;
    this.state.blueprintContext = `Project: ${bp.name || 'Untitled'}\nWho: ${bp.who || '?'}\nWhat: ${bp.what || '?'}\nWhere: ${bp.where || '?'}\nWhen: ${bp.when || '?'}\nWhy: ${bp.why || '?'}`;
  }

  private async handleMessage(msg: any): Promise<void> {
    if (msg.type === 'send-message') {
      const userText = msg.text?.trim();
      if (!userText) return;

      const userMsg: ChatMessage = {
        role: 'user',
        content: userText,
        timestamp: Date.now(),
      };
      this.state.conversation.push(userMsg);
      this.refresh();

      try {
        // Include blueprint context in the prompt
        const contextPrefix = this.state.blueprintContext
          ? `Project Context:\n${this.state.blueprintContext}\n\n---\n\n`
          : '';
        const fullPrompt = contextPrefix + userText;

        const aiResponse = await this.routing.prompt(fullPrompt);

        // Estimate tokens (rough: ~4 chars per token)
        const estimatedTokens = Math.ceil(aiResponse.text.length / 4);
        // Estimate cost (Gemini Flash is ~$0.075 per 1M input tokens, ~$0.30 per 1M output tokens)
        const estimatedCost = (estimatedTokens / 1000000) * 0.30;

        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: aiResponse.text || '',
          timestamp: Date.now(),
          tokens: estimatedTokens,
          cost: estimatedCost,
        };
        this.state.conversation.push(assistantMsg);
        this.refresh();
      } catch (err) {
        const errorMsg: ChatMessage = {
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          timestamp: Date.now(),
        };
        this.state.conversation.push(errorMsg);
        this.refresh();
      }
    } else if (msg.type === 'create-file') {
      const { code, filename } = msg;
      if (!code || !filename) return;

      try {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (!rootPath) {
          vscode.window.showErrorMessage('No workspace open');
          return;
        }
        const filePath = vscode.Uri.file(`${rootPath}/${filename}`);
        await vscode.workspace.fs.writeFile(filePath, Buffer.from(code));
        await vscode.window.showTextDocument(filePath);
        vscode.window.showInformationMessage(`Created ${filename}`);
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to create file: ${err instanceof Error ? err.message : 'unknown'}`
        );
      }
    } else if (msg.type === 'clear-chat') {
      this.state.conversation = [];
      this.refresh();
    }
  }

  public refresh(): void {
    if (!this._view) return;
    this._view.webview.html = this._buildHtml();
  }

  private _buildHtml(): string {
    const nonce = getNonce();
    const totalTokens = this.state.conversation.reduce((sum, msg) => sum + (msg.tokens || 0), 0);
    const totalCost = this.state.conversation.reduce((sum, msg) => sum + (msg.cost || 0), 0);

    const messagesHtml = this.state.conversation
      .map((msg) => {
        const isUser = msg.role === 'user';
        const bubbleClass = isUser ? 'message-bubble user-bubble' : 'message-bubble assistant-bubble';
        const timeStr = new Date(msg.timestamp).toLocaleTimeString();
        const costStr = msg.cost ? ` · $${msg.cost.toFixed(4)}` : '';
        const tokensStr = msg.tokens ? `${msg.tokens} tokens${costStr}` : '';

        let contentHtml = this.escapeHtml(msg.content);
        // Simple code block detection (triple backticks)
        contentHtml = contentHtml.replace(
          /```(\w*)\n([\s\S]*?)```/g,
          (match, lang, code) => {
            const langAttr = lang ? ` data-lang="${this.escapeHtml(lang)}"` : '';
            const encodedCode = this.encodeBase64(code.trim());
            const ext = lang === 'python' ? 'py' : lang === 'javascript' ? 'js' : 'txt';
            return `<div class="code-block"${langAttr}><pre><code>${this.escapeHtml(code.trim())}</code></pre><button class="create-file-btn" data-code="${encodedCode}" data-ext="${ext}">Create File</button></div>`;
          }
        );

        const metadata = isUser ? '' : `<div class="message-meta">${tokensStr} · ${timeStr}</div>`;
        return `<div class="${bubbleClass}"><div class="message-content">${contentHtml}</div>${metadata}</div>`;
      })
      .join('');

    const totalCostStr = totalCost > 0 ? `$${totalCost.toFixed(4)}` : '$0.00';
    const totalStr = totalTokens > 0 ? `${totalTokens} tokens · ${totalCostStr}` : 'No tokens yet';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <style nonce="${nonce}">
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    #conversation {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message-bubble {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-width: 90%;
      word-wrap: break-word;
    }
    .user-bubble {
      align-self: flex-end;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 8px 0 8px 8px;
      padding: 10px 12px;
    }
    .assistant-bubble {
      align-self: flex-start;
      background: var(--vscode-inputOption-activeBorder);
      border-radius: 0 8px 8px 8px;
      padding: 10px 12px;
      border-left: 3px solid var(--vscode-focusBorder);
    }
    .message-content {
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .message-meta {
      font-size: 0.75rem;
      opacity: 0.7;
      margin-top: 4px;
    }
    .code-block {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-editorGroup-border);
      border-radius: 4px;
      margin: 8px 0;
      overflow: hidden;
    }
    .code-block pre {
      padding: 12px;
      overflow-x: auto;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.85rem;
    }
    .code-block code {
      color: var(--vscode-editor-foreground);
    }
    .create-file-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      margin: 8px 12px 12px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85rem;
    }
    .create-file-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    #input-area {
      border-top: 1px solid var(--vscode-editorGroup-border);
      padding: 12px;
      background: var(--vscode-editor-background);
    }
    #message-input {
      width: 100%;
      padding: 10px 12px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-inputBorder);
      border-radius: 4px;
      font-family: inherit;
      resize: none;
      max-height: 100px;
    }
    #message-input:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }
    #stats {
      font-size: 0.75rem;
      opacity: 0.6;
      margin-top: 8px;
      text-align: right;
    }
    .header {
      padding: 12px;
      border-bottom: 1px solid var(--vscode-editorGroup-border);
      font-weight: 600;
      font-size: 0.9rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .clear-btn {
      background: transparent;
      color: var(--vscode-editor-foreground);
      border: none;
      cursor: pointer;
      font-size: 0.75rem;
      opacity: 0.6;
    }
    .clear-btn:hover {
      opacity: 1;
    }
  </style>
</head>
<body>
  <div class="header">
    <span>Chat</span>
    <button class="clear-btn" id="clear-btn">Clear</button>
  </div>
  <div id="conversation">${messagesHtml}</div>
  <div id="input-area">
    <textarea id="message-input" placeholder="Ask about your code, the blueprint, or anything else..." rows="2"></textarea>
    <div id="stats">${totalStr}</div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('message-input');
    const conv = document.getElementById('conversation');
    const clearBtn = document.getElementById('clear-btn');

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = input.value;
        if (text.trim()) {
          vscode.postMessage({ type: 'send-message', text });
          input.value = '';
        }
      }
    });

    clearBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'clear-chat' });
    });

    document.addEventListener('click', (e) => {
      const btn = e.target as HTMLElement;
      if (btn.classList.contains('create-file-btn')) {
        const code = atob(btn.getAttribute('data-code') || '');
        const ext = btn.getAttribute('data-ext') || 'txt';
        const filename = prompt('Filename:', \`file.\${ext}\`);
        if (filename) {
          vscode.postMessage({ type: 'create-file', code, filename });
        }
      }
    });

    conv.scrollTop = conv.scrollHeight;
  </script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (c) => map[c]);
  }

  private encodeBase64(text: string): string {
    return Buffer.from(text).toString('base64');
  }
}
