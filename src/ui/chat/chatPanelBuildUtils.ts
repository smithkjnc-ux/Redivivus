// [SCOPE] Chat Panel Build Utilities — deps builder, intent classifiers, vault-only build
// Extracted from chatPanel.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BuildRequestDeps, classifyIntent, isBuildRequest, handleBuildRequest } from './chatPanelIntent.js';
import { ChatPanel } from './chatPanel.js';

/** Validates that a build root is a legitimate user project directory, not the CHASSIS extension folder or other invalid paths. */
export function isValidBuildRoot(root: string | undefined): root is string {
  if (!root || !fs.existsSync(root)) { return false; }
  // Never build into the CHASSIS extension directory or any VS Code extensions dir
  const lower = root.toLowerCase();
  if (lower.includes('/extensions/chassis') || lower.includes('\\extensions\\chassis')) { return false; }
  if (lower.includes('/resources/app/extensions/') || lower.includes('\\resources\\app\\extensions\\')) { return false; }
  return true;
}

export function panelBuildRequestDeps(panel: ChatPanel): BuildRequestDeps {
  return {
    chassis: (panel as any).chassis,
    routing: (panel as any).routing,
    vault: (panel as any).vault,
    conversation: (panel as any).state.conversation,
    blueprintContext: (panel as any).state.blueprintContext,
    refresh: () => panel.refresh(),
    logError: (t, p, e, len) => panelLogBuildError(panel, t, p, e, len),
    postToWebview: (msg) => (panel as any)._panel.webview.postMessage(msg),
    pendingTask: (panel as any)._pendingTask,
    setPendingTask: (t) => { (panel as any)._pendingTask = t; },
    setActiveBuildCtx: (ctx) => { (panel as any)._activeBuildCtx = ctx; },
    buildMode: (panel as any).state.buildMode,
  };
}

export async function panelClassifyIntent(panel: ChatPanel, text: string) {
  const workspaceRoot = (panel as any).chassis.getWorkspaceRoot();
  const projectName = workspaceRoot ? path.basename(workspaceRoot) : 'No Project';
  const context = {
    projectName,
    workspacePath: workspaceRoot || 'None',
    blueprintStatus: (panel as any).chassis.isInitialized() ? 'Initialized' : 'Not Initialized'
  };
  return classifyIntent(text, (panel as any).routing, context);
}

export async function panelIsBuildRequest(panel: ChatPanel, text: string) {
  return isBuildRequest(text, (panel as any).routing);
}

export async function panelHandleBuildRequest(panel: ChatPanel, task: string, skipComplex = false, isFixRequest = false) {
  return handleBuildRequest(task, panelBuildRequestDeps(panel), skipComplex, isFixRequest);
}

export function panelLogBuildError(panel: ChatPanel, task: string, prompt: string, error: string, promptTokens = 0): void {
  try {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const chassisDir = root ? path.join(root, '.chassis') : null;
    if (!chassisDir) { return; }
    if (!fs.existsSync(chassisDir)) { fs.mkdirSync(chassisDir, { recursive: true }); }
    const div = '─'.repeat(60);
    const entry = [div, `[${new Date().toISOString()}] BUILD FAILED`,
      `Message       : ${task}`, `Error         : ${error}`,
      `Prompt length : ~${promptTokens} tokens`, `Prompt (first 800 chars):`,
      prompt.slice(0, 800), div, ''].join('\n');
    fs.appendFileSync(path.join(chassisDir, 'build_errors.log'), entry, 'utf8');
  } catch { /* never crash the build flow */ }
}

export function panelLoadBlueprintContext(panel: ChatPanel): void {
  const state = (panel as any).state;
  if (!(panel as any).chassis.isInitialized()) { state.blueprintContext = ''; return; }
  const config = (panel as any).chassis.loadConfig();
  if (!config?.blueprint) { state.blueprintContext = ''; return; }
  const bp = config.blueprint;
  state.blueprintContext = [
    `Project: ${config.projectName || 'Untitled'}`,
    `Who: ${bp.who || '?'}`, `What: ${bp.what || '?' }`,
    `Where: ${bp.where || '?'}`, `When: ${bp.when || '?'}`, `Why: ${bp.why || '?' }`,
  ].join('\n');
}

export async function panelVaultOnlyBuild(panel: ChatPanel, task: string): Promise<void> {
  const state = (panel as any).state;
  const routing = (panel as any).routing;

  const prompt = `Generate a complete, reusable code snippet for: "${task}"\nReturn ONLY the code. No markdown fences, no explanation.`;
  let res: { success: boolean; text: string; error?: string };
  try {
    res = await routing.routeByComplexity(task, prompt);
  } catch (e) {
    res = { success: false, text: '', error: e instanceof Error ? e.message : String(e) };
  }

  if (!res.success || !res.text.trim()) {
    state.conversation.push({ role: 'assistant', content: `❌ Vault build failed: ${res.error || 'No code returned'}`, timestamp: Date.now() });
    panel.refresh();
    return;
  }

  const code = res.text.replace(/^```[a-zA-Z]*\n?/m, '').replace(/\n?```$/m, '').trim();

  // Auto-capture snippet to vault via temp file — uses full extraction + dedup + quality gate
  // [DONE] was [NEXT] — vault API is accessible via (panel as any).vault
  let vaultCapture = '';
  const vault = (panel as any).vault;
  if (vault) {
    try {
      const ext = /python|\.py\b/i.test(task) ? '.py' : /html/i.test(task) ? '.html' : /css/i.test(task) ? '.css' : '.js';
      const tmpPath = path.join(os.tmpdir(), `chassis-snippet-${Date.now()}${ext}`);
      fs.writeFileSync(tmpPath, code, 'utf-8');
      const { autoCaptureFile } = await import('../../services/vault/vaultAutoCapture.js');
      const projectName = (panel as any).chassis?.isInitialized?.() ? ((panel as any).chassis.loadConfig()?.projectName || 'snippets') : 'snippets';
      const captured = await autoCaptureFile(tmpPath, projectName, vault, task);
      try { fs.unlinkSync(tmpPath); } catch { /* temp cleanup best-effort */ }
      if (captured.newItems > 0) { vaultCapture = `\n&#x1F4BE; Saved **${captured.newItems}** snippet${captured.newItems !== 1 ? 's' : ''} to vault`; }
    } catch { /* never block on vault failure */ }
  }

  state.conversation.push({
    role: 'assistant',
    content: `&#x2705; Snippet ready — use the Create File button below to save it.${vaultCapture}\n\`\`\`\n${code}\n\`\`\``,
    timestamp: Date.now(),
  });
  panel.refresh();
}
