// [SCOPE] Chat Panel Build Runner — thin client entry point. Collects context and delegates to cloud.
// All build logic lives at /api/v1/build. No account token = no build.

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import type { BuildRequestDeps } from '../ai/chatPanelIntent';
import type { VaultSearchResult } from '../../services/vault/buildFromVaultSearch';
import { isValidBuildRoot } from './chatPanelBuildUtils';
import { autoCreateProject } from './chatPanelBuildAutoCreate';
import { callCloudBuild } from '../../services/build/cloudBuildClient.js';
import { getAccountToken } from '../../services/api/apiClient.js';

function isProjectsContainer(root: string): boolean {
  const cfg = vscode.workspace.getConfiguration('redivivus').get<string>('projectsDirectory', '~/projects')!.replace('~', os.homedir());
  return path.resolve(root) === path.resolve(cfg);
}

function getLiveRoot(deps: BuildRequestDeps): string | undefined {
  const liveRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (isValidBuildRoot(liveRoot) && !isProjectsContainer(liveRoot)) { return liveRoot; }
  if (!liveRoot) { return undefined; }
  const redivivusRoot = deps.redivivus?.getWorkspaceRoot?.();
  if (isValidBuildRoot(redivivusRoot) && redivivusRoot !== liveRoot && !isProjectsContainer(redivivusRoot)) { return redivivusRoot; }
  return undefined;
}

export async function runBuildAfterGates(
  task: string,
  deps: BuildRequestDeps,
  _skipComplex: boolean,
  isFixRequest: boolean,
  _precomputedVaultSearch: VaultSearchResult | undefined,
): Promise<void> {
  deps.postToWebview({ type: 'set-status', status: 'working' });

  let root = getLiveRoot(deps);

  // No project open — auto-create a folder
  if (!root) {
    try {
      const created = await autoCreateProject(task, deps);
      root = created.dir;
      deps.blueprintContext = created.blueprintContext;
    } catch (e) {
      deps.postToWebview({ type: 'set-status', status: 'ready' });
      deps.conversation.push({ role: 'assistant', content: `Could not create project folder: ${e instanceof Error ? e.message : String(e)}`, timestamp: Date.now() });
      deps.refresh();
      return;
    }
  }

  // Show working indicator
  deps.conversation.push({ role: 'assistant', content: '⚙️ Building...', timestamp: Date.now() });
  deps.refresh();

  try {
    const result = await callCloudBuild(task, root, deps, { isFix: isFixRequest });

    if (!result.success) {
      if (result.error === 'NOT_AUTHENTICATED') {
        deps.conversation.splice(-1, 1);
        deps.conversation.push({
          role: 'assistant',
          content: '🔒 **Session expired — please sign in again.**\n\nRun **Redivivus: Sign In** from the command palette.',
          timestamp: Date.now(),
        });
        deps.refresh();
        vscode.commands.executeCommand('redivivus.signIn');
        return;
      }
      deps.conversation.splice(-1, 1);
      deps.conversation.push({
        role: 'assistant',
        content: `❌ **Build failed:** ${result.error}\n\n_Try rephrasing your request._`,
        timestamp: Date.now(),
      });
      deps.refresh();
      return;
    }

    // Build succeeded — replace working indicator with result
    deps.conversation.splice(-1, 1);
    const files = result.files ?? [];
    const fileList = files.map(f => `- \`${f.path}\``).join('\n');
    const openWorkspaceToken = files.length > 0 && root && !vscode.workspace.workspaceFolders?.some(wf => wf.uri.fsPath === root)
      ? `\n__OPEN_WORKSPACE__${root}|||END_OPEN__`
      : '';
    const htmlFile = files.find(f => f.path.endsWith('.html'));
    const previewToken = htmlFile
      ? `\n__PREVIEW_BROWSER__${path.join(root, htmlFile.path)}|||END_PREVIEW__`
      : '';

    const modelLabel = result.model ?? 'AI';
    const tokens = (result.inputTokens ?? 0) + (result.outputTokens ?? 0);
    const cost = tokens > 0 ? ` (~${tokens.toLocaleString()} tokens)` : '';
    const narration = result.narration ? `\n\n**Who Did What & Why**\n${result.narration}` : '';

    deps.conversation.push({
      role: 'assistant',
      content: `__RESULT_CARD__\n✅ Done! Built ${files.length} file${files.length !== 1 ? 's' : ''}\n\n${fileList}${narration}\n\n*Built with ${modelLabel}${cost}*\n__END_RESULT_CARD__${openWorkspaceToken}${previewToken}`,
      timestamp: Date.now(),
    });
    deps.refresh();

    if (isFixRequest) {
      vscode.commands.executeCommand('redivivus.resolveFix', task, files.map(f => path.join(root!, f.path)));
    }
  } finally {
    deps.setActiveBuildCtx(undefined);
    deps.postToWebview({ type: 'set-status', status: 'ready' });
  }
}

/** Handles edit-request messages — edits an existing file in-place for TODO/scope fixes. */
export { handleEditRequest } from '../../ui/panels/chat/chatPanelEditHandler';
