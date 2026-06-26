// [SCOPE] Visual Contract Editor — VS Code panel host, message handler, and patch dispatcher

import * as vscode from 'vscode';
import * as path from 'path';
import { getVisualContractHtml } from './visualContractPanelHtml.js';
import { extractVisualContract } from '../logic/propertyExtractor.js';
import { applyBatchPatches, applyPropertyPatch } from '../logic/visualContractPatcher.js';
import type { VisualContract, VisualProperty } from '../logic/visualContractTypes.js';
import { ChatPanel } from '../../chat/ui/chatPanel.js';
import { postToChatWebview } from '../../chat/ui/chatPanelPublicAPI.js';

let _activePanel: vscode.WebviewPanel | undefined;

export async function openVisualContractPanel(
  context: vscode.ExtensionContext,
  projectRoot: string,
  builtFiles: string[],
  routing?: any,
): Promise<void> {
  if (_activePanel) {
    _activePanel.reveal(vscode.ViewColumn.Two);
    const contract = extractVisualContract(projectRoot, builtFiles);
    let bSpec = null;
    try { const { getCurrentSpec } = await import('../../../features/ai/logic/visualSpecService.js'); bSpec = getCurrentSpec(); } catch {}
    _activePanel.webview.postMessage({ type: 'load-contract', contract, baselineSpec: bSpec });
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'redivivusVisualEditor',
    'Visual Editor',
    { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true },
  );
  _activePanel = panel;
  panel.onDidDispose(() => { _activePanel = undefined; }, null, context.subscriptions);

  const contract = extractVisualContract(projectRoot, builtFiles);
  console.log('[Redivivus][VisualEditor] projectRoot:', projectRoot);
  console.log('[Redivivus][VisualEditor] builtFiles:', builtFiles);
  console.log('[Redivivus][VisualEditor] contract.properties.length:', contract.properties.length);
  console.log('[Redivivus][VisualEditor] contract.properties:', JSON.stringify(contract.properties.slice(0, 5)));
  // Include upstream baseline spec if one was established before this build
  let baselineSpec: import('../../../features/ai/logic/visualSpecService').VisualSpec | null = null;
  try { const { getCurrentSpec } = await import('../../../features/ai/logic/visualSpecService.js'); baselineSpec = getCurrentSpec(); } catch {}
  const nonce = Math.random().toString(36).slice(2);
  panel.webview.html = getVisualContractHtml(nonce, contract);

  // Send baseline spec alongside the extracted contract so editor knows intended values
  setTimeout(() => { panel.webview.postMessage({ type: 'load-contract', contract, baselineSpec }); }, 100);

  panel.webview.onDidReceiveMessage(
    async (msg) => {
      if (msg.type === 'debug-log') {
        console.log('[Redivivus][VisualEditor] WEBVIEW REPORTS: contractIsNull=', msg.contractIsNull, 'propCount=', msg.propCount, 'snippet=', msg.contractSnippet);
        return;
      }
      handleMessage(msg, panel, contract, projectRoot, routing, context);
    },
    undefined,
    context.subscriptions,
  );
}

async function handleMessage(
  msg: any,
  panel: vscode.WebviewPanel,
  contract: VisualContract,
  projectRoot: string,
  routing: any,
  context: vscode.ExtensionContext,
): Promise<void> {

  if (msg.type === 'apply-all') {
    const patches: Array<{ prop: VisualProperty; newValue: string }> = [];
    for (const [id, newValue] of Object.entries(msg.pending as Record<string, string>)) {
      const prop = contract.properties.find(p => p.id === id);
      if (prop) { patches.push({ prop, newValue }); }
    }
    const results = applyBatchPatches(patches, projectRoot);
    const failed = results.filter(r => !r.success);
    panel.webview.postMessage({
      type: 'patch-ack',
      ok: failed.length === 0,
      message: failed.length ? failed.map(r => r.message).join('; ') : 'All changes applied',
    });
    // Update in-memory contract values for the session
    for (const { prop, newValue } of patches) { prop.value = newValue; }
    // Re-extract and push refreshed contract so swatches reflect applied values
    if (failed.length === 0) {
      const refreshed = extractVisualContract(projectRoot, contract.files);
      panel.webview.postMessage({ type: 'load-contract', contract: refreshed });
      postToChatWebview({ type: 'preview-refresh' });
    }
    return;
  }

  if (msg.type === 'property-changed' && msg.immediate) {
    const prop = contract.properties.find(p => p.id === msg.id);
    if (!prop) { return; }
    const result = applyPropertyPatch(prop, msg.value, projectRoot);
    panel.webview.postMessage({ type: 'patch-ack', ok: result.success, message: result.message });
    if (result.success) { prop.value = msg.value; }
    return;
  }

  if (msg.type === 'add-section') {
    // Pro mode: dispatch a fix request to the active chat panel to build the new section
    const desc = msg.description?.trim();
    if (!desc) { return; }
    const prompt = `Add a new section to the project: ${desc}. Match the existing visual style and color scheme.`;
    if (ChatPanel.currentPanel) {
      await ChatPanel.currentPanel.handleMessage({ type: 'fix-request', text: prompt });
      vscode.window.showInformationMessage(`Redivivus: Building section — "${desc}"`);
    } else {
      // Open chat and send the request
      await vscode.commands.executeCommand('redivivus.openChatPanel');
      setTimeout(async () => {
        if (ChatPanel.currentPanel) {
          await ChatPanel.currentPanel.handleMessage({ type: 'fix-request', text: prompt });
        }
      }, 600);
    }
    return;
  }
}
