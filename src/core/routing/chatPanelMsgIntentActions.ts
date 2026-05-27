// [SCOPE] Chat intent action handlers — run, scaffold, service setup
// Extracted from chatPanelMsgSendMessage.ts to keep that file under 200 lines.

import * as vscode from 'vscode';
import type { ChatMessage } from '../../ui/panels/chat/chatPanelHtml';
import type { MessageHandlerDeps } from './chatPanelMessages';

type Conv = ChatMessage[];

export async function handleRunIntent(intent: any, deps: MessageHandlerDeps, conversation: Conv, refresh: () => void): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    conversation.push({ role: 'assistant', content: 'No project is open -- open a project folder first.', timestamp: Date.now() });
    refresh(); return;
  }
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');

  if (intent.subtype === 'install') {
    const hasPkg = fs.existsSync(path.join(root, 'package.json'));
    const hasReqs = fs.existsSync(path.join(root, 'requirements.txt'));
    const hasCargo = fs.existsSync(path.join(root, 'Cargo.toml'));
    const hasGoMod = fs.existsSync(path.join(root, 'go.mod'));
    let installCmd = 'npm install';
    let depsLabel = 'Node.js';
    if (hasReqs && !hasPkg) { installCmd = 'pip install -r requirements.txt'; depsLabel = 'Python'; }
    else if (hasCargo) { installCmd = 'cargo build'; depsLabel = 'Rust'; }
    else if (hasGoMod) { installCmd = 'go mod download'; depsLabel = 'Go'; }
    else if (!hasPkg && !hasReqs) {
      conversation.push({ role: 'assistant', content: 'No package.json or requirements.txt found -- nothing to install.', timestamp: Date.now() });
      refresh(); return;
    }
    const terminal = vscode.window.createTerminal(`Redivivus: Install (${depsLabel})`);
    terminal.show();
    terminal.sendText(installCmd);
    conversation.push({ role: 'assistant', content: `⌛ Running \`${installCmd}\` in terminal...`, timestamp: Date.now() });
    refresh(); return;
  }

  const candidates = ['index.html', 'main.html', 'index.js', 'main.js', 'app.js', 'main.py', 'app.py', 'index.py'];
  const main = candidates.find(f => fs.existsSync(path.join(root, f)));
  if (main) {
    await vscode.env.openExternal(vscode.Uri.file(path.join(root, main)));
    conversation.push({ role: 'assistant', content: `Opening \`${main}\` in your browser.`, timestamp: Date.now() });
  } else {
    conversation.push({ role: 'assistant', content: 'I couldn\'t find a main file to run. Which file would you like to open?', timestamp: Date.now() });
  }
  refresh();
}

export async function handleScaffoldIntent(userText: string, deps: MessageHandlerDeps, conversation: Conv, refresh: () => void): Promise<void> {
  let root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  let autoOpened = false;

  // [FIX] Force modification requests to bypass scaffold and go straight to fix pipeline
  if (root) {
    const isInit = deps.redivivus?.isInitialized?.() || require('fs').existsSync(require('path').join(root, '.redivivus', 'config.json'));
    if (isInit) {
      const { isModificationRequest } = await import('../build/chatPanelBuildInference.js');
      if (await isModificationRequest(userText, deps.routing)) {
        const { handleFixRequest } = await import('./chatPanelMsgFix.js');
        await handleFixRequest(userText, deps);
        return;
      }
    }
  }

  if (!root) {
    try {
      const { autoCreateProject } = await import('../build/chatPanelBuildAutoCreate.js');
      const created = await autoCreateProject(userText, deps as any);
      root = created.dir;
      autoOpened = true;
    } catch (e: any) {
      conversation.push({ role: 'assistant', content: `Could not create project folder: ${e.message}`, timestamp: Date.now() });
      refresh(); return;
    }
  }
  const { detectScaffoldIntent, runScaffold } = await import('../build/chatPanelScaffold.js');
  const scaffoldInfo = detectScaffoldIntent(userText);
  if (!scaffoldInfo) {
    conversation.push({ role: 'assistant', content: 'I can scaffold: **React** (Vite + TypeScript), **Python Flask**, **Go API**, or **Node Express**. Which one?', timestamp: Date.now() });
    refresh(); return;
  }
  conversation.push({ role: 'assistant', content: `Scaffolding **${scaffoldInfo.type}** project...`, timestamp: Date.now() });
  refresh();
  try {
    const { files, guidance } = await runScaffold(null as any, scaffoldInfo.type, root);
    conversation.push({ role: 'assistant', content: `✅ Scaffold complete! Created:\n\n${files.map((f: string) => `- \`${f}\``).join('\n')}\n\n**Next steps:** ${guidance}`, timestamp: Date.now() });
    if (autoOpened && root) { await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root)); }
  } catch (e: any) {
    conversation.push({ role: 'assistant', content: `Scaffold failed: ${e.message}`, timestamp: Date.now() });
  }
  refresh();
}

export async function handleServiceIntent(userText: string, deps: MessageHandlerDeps, conversation: Conv, refresh: () => void): Promise<void> {
  let root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  let autoOpened = false;
  if (!root) {
    try {
      const { autoCreateProject } = await import('../build/chatPanelBuildAutoCreate.js');
      const created = await autoCreateProject(userText, deps as any);
      root = created.dir;
      autoOpened = true;
    } catch (e: any) {
      conversation.push({ role: 'assistant', content: `Could not create project folder: ${e.message}`, timestamp: Date.now() });
      refresh(); return;
    }
  }
  const { detectServiceIntent, runServiceSetup, formatServiceSetupResult } = await import('../../ui/panels/chat/chatPanelServiceTemplates.js');
  const serviceInfo = detectServiceIntent(userText);
  if (!serviceInfo) {
    conversation.push({ role: 'assistant', content: 'I can set up: **Firebase**, **Supabase**, **Stripe**, or **OpenAI**. Which one?', timestamp: Date.now() });
    refresh(); return;
  }
  conversation.push({ role: 'assistant', content: `Setting up **${serviceInfo.type}**...`, timestamp: Date.now() });
  refresh();
  try {
    const { files, notes } = await runServiceSetup(serviceInfo.type, root);
    conversation.push({ role: 'assistant', content: formatServiceSetupResult(serviceInfo.type, files, notes), timestamp: Date.now() });
    if (autoOpened && root) { await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root)); }
  } catch (e: any) {
    conversation.push({ role: 'assistant', content: `Service setup failed: ${e.message}`, timestamp: Date.now() });
  }
  refresh();
}
