// [SCOPE] Chat Panel Edit Handler — handles edit-request for in-place file fixes
// Extracted from chatPanelIntent.ts

import * as vscode from 'vscode';
import { BuildRequestDeps } from './chatPanelIntent.js';
import { runEditFileBuild, EditBuildContext } from './chatPanelEditBuild.js';

export async function handleEditRequest(msg: any, deps: Omit<BuildRequestDeps, 'blueprintContext' | 'pendingTask' | 'setPendingTask' | 'setActiveBuildCtx'>): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { return; }
  deps.conversation.push({ role: 'user', content: `Fix \`${msg.filePath}\`: ${msg.task}`, timestamp: Date.now() });
  deps.refresh();
  const ctx: EditBuildContext = {
    filePath: msg.filePath,
    task: msg.task,
    issueType: msg.issueType || 'todo',
    root,
    routing: deps.routing,
    vault: deps.vault,
    conversation: deps.conversation,
    refresh: deps.refresh,
    logError: deps.logError,
    onBuildFinished: (task: string, builtFiles?: string[]) => {
      vscode.commands.executeCommand('chassis.resolveFix', task, builtFiles);
      const { ChatPanel } = require('./chatPanel.js');
      ChatPanel.onBuildFinished?.(task, builtFiles || []);
    },
    onBuildFailed: (task, reason) => { vscode.commands.executeCommand('chassis.buildFailed', task, reason); },
  };
  await runEditFileBuild(ctx);
}
