// [SCOPE] Chat Panel Edit Handler — handles edit-request for in-place file fixes
// Extracted from chatPanelIntent.ts

import * as vscode from 'vscode';
import type { BuildRequestDeps } from '../../../core/ai/chatPanelIntent';
import type { EditBuildContext } from '../../../core/build/chatPanelEditBuild';
import { runEditFileBuild } from '../../../core/build/chatPanelEditBuild';
import { autoCommitIfEnabled } from '../../../services/gitAutoCommitService';
import { refreshSetupProgressIfOpen } from '../../../services/project/setupProgressPanel';
import { getActiveProjectRoot } from '../../../services/project/activeProjectRoot.js';

export async function handleEditRequest(msg: any, deps: Omit<BuildRequestDeps, 'pendingTask' | 'setPendingTask' | 'setActiveBuildCtx'>): Promise<void> {
  // [FIX] Resolve the edit against the ACTIVE project root, not the raw workspace folder. Under Model A the
  // workspace is the projects CONTAINER (~/projects) and the project is a subfolder, so chatPanelEditBuild's
  // `path.join(root, filePath)` was reading/writing ~/projects/src/ai.js (nonexistent) instead of the real
  // ~/projects/<project>/src/ai.js. This is the write-side half of the architect Fix-All path bug.
  const root = getActiveProjectRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { return; }
  deps.conversation.push({ role: 'user', content: `Fix \`${msg.filePath}\`: ${msg.task}`, timestamp: Date.now() });
  deps.refresh();
  const ctx: EditBuildContext = {
    filePath: msg.filePath,
    task: msg.task,
    issueType: msg.issueType || 'todo',
    root,
    blueprintContext: deps.blueprintContext,
    routing: deps.routing,
    vault: deps.vault,
    conversation: deps.conversation,
    refresh: deps.refresh,
    logError: deps.logError,
    onBuildFinished: (task: string, builtFiles?: string[]) => {
      vscode.commands.executeCommand('redivivus.resolveFix', task, builtFiles);
      // [FIX] Migrated from dead ChatPanel.onBuildFinished static to buildEvents
      import('../../../services/build/buildEvents.js').then(({ buildEvents }) => {
        buildEvents.emit('build:finished', task, builtFiles || []);
      }).catch(() => {});
    },
    onBuildFailed: (task, reason) => { vscode.commands.executeCommand('redivivus.buildFailed', task, reason); },
  };
  await runEditFileBuild(ctx);
  await autoCommitIfEnabled(root, `Redivivus updated: ${msg.filePath}`);
  refreshSetupProgressIfOpen().catch(() => {});
}
