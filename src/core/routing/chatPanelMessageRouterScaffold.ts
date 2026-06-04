// [SCOPE] scaffold-quickstart handler — extracted from chatPanelMessageRouterEarlyExits.ts (Rule 9 split).
// When no workspace is open, shows the create-folder dialog so the user picks a location first.
// When a workspace IS open, starts the build directly via _handleBuildRequest.

import * as vscode from 'vscode';
import { ChatPanel } from '../../ui/panels/chat/chatPanel';

// Template tasks — specific enough that the AI builds the right type of project, not a generic scaffold
const TEMPLATE_TASKS: Record<string, string> = {
  react: 'scaffold a new React app with Vite and TypeScript',
  flask: 'scaffold a new Python Flask REST API with JSON endpoints, CORS support, and an in-memory data store',
  go: 'scaffold a new Go HTTP API with JSON routes, a health check endpoint, and standard project structure',
  express: 'scaffold a new Node.js Express REST API with JSON middleware, a health check route, and modular router structure',
};

const TEMPLATE_SLUGS: Record<string, string> = {
  react: 'react-app',
  flask: 'flask-api',
  go: 'go-api',
  express: 'express-api',
};

// [WARN] No workspace open path posts show-panel/create-folder to the webview instead of calling
// _handleBuildRequest directly. The pendingTask is resumed by onNewProject -> resumeBuildTask after
// the user creates and opens the folder. Keep in sync with chatPanelMessageRouterEarlyExits create-folder handler.
export async function handleScaffoldQuickstart(panel: ChatPanel, msg: any): Promise<boolean> {
  const state = (panel as any).state;
  const _panel = (panel as any)._panel;

  const slug = TEMPLATE_SLUGS[msg.template] || msg.template;
  const task = TEMPLATE_TASKS[msg.template] || `scaffold a new ${msg.template} project`;

  if (!vscode.workspace.workspaceFolders?.length) {
    _panel.webview.postMessage({ type: 'show-panel', panelType: 'create-folder', prefillName: slug, pendingTask: task });
    return true;
  }

  state.buildMode = 'direct';
  state.conversation.push({ role: 'user', content: task, timestamp: Date.now() });
  state.conversation.push({ role: 'assistant', content: `[>] Scaffolding ${msg.template} project...`, timestamp: Date.now() });
  panel.refresh();
  await (panel as any)._handleBuildRequest(task, true, false);
  return true;
}
