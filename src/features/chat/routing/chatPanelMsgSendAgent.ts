// [SCOPE] Agent Pipeline execution — shared helper for Adaptive routing.
// Extracted from chatPanelMsgSendMessage.ts to comply with Rule 9 (200-line limit).

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { MessageHandlerDeps } from './chatPanelMessages.js';
import type { ChatMessage } from '../ui/chatPanelHtml.js';
import { deriveFileBase } from '../build/chatPanelBuildInference.js';
import { confirmAgentRun } from '../../../shared/ai/infrastructure/agentPermissionSummary.js';

/** Runs the Agent Mode loop — used by adaptive routing. */
export async function runAgentMode(userText: string, deps: MessageHandlerDeps, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  const { executeAgentTask } = await import('../../../shared/ai/infrastructure/agentService.js');
  let rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  let config = deps.redivivus.isInitialized() ? deps.redivivus.loadConfig() : null;
  let blueprintCtx = config?.blueprint ? JSON.stringify(config.blueprint) : '';

  // [Redivivus] Auto-create project directory if no workspace is open — prevents files being written to extension dir
  if (!rootPath) {
    const slug = await deriveFileBase(userText, deps.routing, deps.usageTracker);
    const projectsDir = vscode.workspace.getConfiguration('redivivus')
      .get<string>('projectsDirectory', '~/projects')!
      .replace('~', os.homedir());
    rootPath = path.join(projectsDir, slug);
    fs.mkdirSync(path.join(rootPath, '.redivivus'), { recursive: true });
    const bp = { what: userText.slice(0, 200), who: '', where: '', when: 'now', why: '' };
    const cfg = { projectName: slug, initialized: true, blueprint: bp };
    fs.writeFileSync(path.join(rootPath, '.redivivus', 'config.json'), JSON.stringify(cfg, null, 2));
    fs.writeFileSync(path.join(rootPath, '.redivivus', 'blueprint.md'), `# ${slug}\n\n**What:** ${bp.what}\n`);
    blueprintCtx = `Project: ${slug}\nWhat: ${bp.what}`;
    conversation.push({ role: 'assistant', content: `📁 **Auto-created project:** \`${slug}\` at \`${rootPath}\``, timestamp: Date.now() });
    refresh();
  }

  // [Redivivus] Ensure .redivivus/ exists even in an open workspace that isn't initialized
  if (rootPath && !fs.existsSync(path.join(rootPath, '.redivivus'))) {
    fs.mkdirSync(path.join(rootPath, '.redivivus'), { recursive: true });
    const bp = { what: userText.slice(0, 200), who: '', where: '', when: 'now', why: '' };
    const slug = path.basename(rootPath);
    const cfg = { projectName: slug, initialized: true, blueprint: bp };
    fs.writeFileSync(path.join(rootPath, '.redivivus', 'config.json'), JSON.stringify(cfg, null, 2));
    fs.writeFileSync(path.join(rootPath, '.redivivus', 'blueprint.md'), `# ${slug}\n\n**What:** ${bp.what}\n`);
  }

  const agentCtx: any = {
    root: rootPath, task: userText,
    log: (msg: string) => { conversation.push({ role: 'assistant', content: msg, timestamp: Date.now() }); refresh(); },
    modifiedFiles: new Set<string>(), snapshotId: undefined,
    routing: deps.routing, blueprintContext: blueprintCtx,
    // [TOOL-GAP] Live per-session cost choice — reuses the clarify card/bridge (synchronous: blocks
    // run_command until the user clicks). Times out to "wait" so it can never hang the build.
    askUser: async (prompt: string): Promise<'alternate' | 'wait'> => {
      const { encodeClarifyToken } = await import('../ui/chatPanelClarify.js');
      const { setPendingClarifyResolve } = await import('../ui/chatPanelClarifyBridge.js');
      const q = { id: 'toolgap_cost_choice', question: prompt,
        options: [{ label: 'Try alternate approach (uses extra tokens)' }, { label: 'Wait' }] };
      conversation.push({ role: 'assistant', content: encodeClarifyToken([q]), timestamp: Date.now() });
      refresh();
      const answers = await new Promise<Record<string, string>>((resolve) => {
        setPendingClarifyResolve(resolve);
        setTimeout(() => resolve({ toolgap_cost_choice: 'Wait' }), 300_000);
      });
      return (answers['toolgap_cost_choice'] || 'Wait').startsWith('Try alternate') ? 'alternate' : 'wait';
    },
  };
  let projectContext = blueprintCtx ? `Blueprint: ${blueprintCtx}` : 'No blueprint available.';
  try {
    const files = await vscode.workspace.findFiles('**/*.*', '**/node_modules/**,**/.git/**,**/dist/**,**/out/**');
    projectContext += `\n\nPROJECT FILES:\n- ${files.map(f => vscode.workspace.asRelativePath(f)).slice(0, 100).join('\n- ')}\n\n(Use these exact paths.)`;
  } catch (_e) {}
  deps.panel.webview.postMessage({ type: 'set-status', status: 'working' });

  // [AGENT-CONFIRM] Show plain English pre-run summary and wait for user approval before touching anything.
  const { approved } = await confirmAgentRun(userText, deps, conversation, refresh, true);
  if (!approved) {
    conversation.push({ role: 'assistant', content: `**Cancelled.** No changes were made. Describe what you want differently and I\'ll try again.`, timestamp: Date.now() });
    refresh();
    deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
    return;
  }

  const result = await executeAgentTask(userText, projectContext, deps.routing, agentCtx, agentCtx.log);
  deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
  if (!result.success && result.error) {
    conversation.push({ role: 'assistant', content: `**Agent failed:** ${result.error}`, timestamp: Date.now() });
  } else if (result.finalAnswer) {
    let finalContent = result.finalAnswer;
    let builtFiles: string[] = [];
    if (agentCtx.modifiedFiles.size > 0 && result.ledger) {
      const { buildResultCard } = await import('../ui/chatPanelStory.js');
      const { buildPostBuildGuidance } = await import('../build/chatPanelPostBuild.js');
      const { BuildHistoryService, makeBuildHistoryEntry } = await import('../build/services/buildHistoryService.js');
      const ls = result.ledger.hasData() ? result.ledger.getSummary() : undefined;
      const totalTokens = ls ? ls.reduce((s: number, l: any) => s + l.tokens, 0) : 0;
      const totalCost = ls ? ls.reduce((s: number, l: any) => s + l.costUSD, 0) : 0;
      builtFiles = Array.from(agentCtx.modifiedFiles as Set<string>);
      const card = buildResultCard(builtFiles, 0, totalTokens, totalCost, 0, agentCtx.snapshotId, 0, true, ls);
      
      let nextSteps = '';
      try { nextSteps = buildPostBuildGuidance(rootPath, builtFiles); } catch (e) {}
      
      let previewToken = '';
      const htmlFile = builtFiles.find((f: string) => f.endsWith('.html'));
      if (htmlFile) {
        previewToken = `\n__PREVIEW_BROWSER__${path.join(rootPath, htmlFile)}|||END_PREVIEW_BROWSER__`;
      }
      
      const buildResultMarker = builtFiles.length > 0 ? `\n__BUILD_RESULT__${builtFiles[0]}|||${path.join(rootPath, builtFiles[0])}|||END__` : '';
      const curRoots = (vscode.workspace.workspaceFolders ?? []).map(f => path.resolve(f.uri.fsPath));
      const openWsToken = rootPath && !curRoots.includes(path.resolve(rootPath)) ? `\n__OPEN_WORKSPACE__${rootPath}|||END_OPEN__` : '';
      const hasVisual = builtFiles.some((f: string) => /\.(html|css)$/i.test(f));
      const editToken = hasVisual && rootPath ? `\n__EDIT_VISUALLY__${rootPath}|||END_EDIT_VISUALLY__` : '';
      let runToken = '';
      if (!htmlFile && rootPath) { try { const { detectRunCommand } = await import('../build/services/runtimeRunner.js'); if (detectRunCommand(rootPath)) { runToken = `\n__RUN_PROJECT__${rootPath}|||END_RUN__`; } } catch {} }

      finalContent += `\n\n${card}${buildResultMarker}${openWsToken}${previewToken}${runToken}${editToken}${nextSteps}`;
      const sw = deps.routing.selectSupervisorAndWorker();
      try {
        new BuildHistoryService(rootPath).record(makeBuildHistoryEntry({
          snapshotId: agentCtx.snapshotId || Date.now().toString(), task: userText, files: builtFiles,
          tokensUsed: totalTokens, costUSD: totalCost, source: 'ai',
          supervisor: sw.supervisor, worker: null, resultCardToken: card,
        }));
      } catch (e) {}
    }
    conversation.push({ role: 'assistant', content: finalContent, timestamp: Date.now() });
    
    // Fire build:finished event so save-points and session recording trigger
    if (builtFiles.length > 0) {
      setTimeout(() => {
        import('../build/services/buildEvents.js').then(({ buildEvents }) => {
          buildEvents.emit('build:finished', userText, builtFiles, rootPath);
        });
      }, 300);
    }
  }
  refresh();
}
