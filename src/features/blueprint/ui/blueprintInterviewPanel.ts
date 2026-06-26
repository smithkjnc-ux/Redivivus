// [SCOPE] Blueprint Interview Panel — panel lifecycle and message handler
// Thin router: HTML/JS templates live in blueprintInterviewHtml.ts and blueprintInterviewScript.ts

import * as vscode from 'vscode';
import type { BlueprintSpec, ProjectType
} from '../logic/blueprintInterview.js';
import {
  detectProjectType, getLayersForType, scoreBlueprint,
  buildBlueprintSummary
} from '../logic/blueprintInterview.js';
import { buildInterviewHtmlFull } from './blueprintInterviewHtmlFull.js';
import { buildBlueprintViewHtml } from './blueprintInterviewHtml.js';

let _blueprintPanel: vscode.WebviewPanel | undefined;

/** Opens the Blueprint Interview as a standalone full-width panel in the main editor column */
export function openBlueprintPanel(
  context: vscode.ExtensionContext,
  redivivus: any,
  routingService: any
): void {
  // Singleton — reveal existing panel if open
  if (_blueprintPanel) {
    _blueprintPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'redivivusBlueprint',
    'Blueprint Interview',
    { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
    { enableScripts: true, retainContextWhenHidden: true }
  );

  _blueprintPanel = panel;
  panel.onDidDispose(() => { _blueprintPanel = undefined; }, null, context.subscriptions);

  panel.webview.onDidReceiveMessage(
    async (msg) => {
      if (msg.type === 'bi-redo') {
        // User clicked Redo Interview — replace HTML with fresh form
        const layers = getLayersForType('unknown');
        const lj = JSON.stringify(layers);
        const n2 = Math.random().toString(36).slice(2);
        panel.webview.html = buildInterviewHtmlFull(lj, n2);
        return;
      }
      await handleInterviewMessage(msg, panel.webview, redivivus, routingService);
    },
    undefined,
    context.subscriptions
  );

  // Check if blueprint.md already exists — show it instead of blank form
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const existingBlueprint = root ? (() => {
    try { return require('fs').readFileSync(require('path').join(root, '.redivivus', 'blueprint.md'), 'utf8'); } catch { return null; }
  })() : null;

  const nonce = Math.random().toString(36).slice(2);

  if (existingBlueprint) {
    panel.webview.html = buildBlueprintViewHtml(existingBlueprint, nonce);
    return;
  }

  // Embed layers as JSON directly — no bi-start/bi-layers roundtrip needed
  const initialLayers = getLayersForType('unknown');
  const layersJson = JSON.stringify(initialLayers);
  panel.webview.html = buildInterviewHtmlFull(layersJson, nonce);
}

// --- Extension-side message handler ---

export async function handleInterviewMessage(
  msg: any,
  webview: vscode.Webview,
  redivivus: any,
  routingService: any
): Promise<boolean> {
  if (msg.type === 'bi-start') {
    // Send foundation layer first — type detection happens after
    const layers = getLayersForType('unknown');
    webview.postMessage({ type: 'bi-layers', layers, projectType: 'unknown' });
    return true;
  }

  if (msg.type === 'bi-detect-type') {
    const type: ProjectType = detectProjectType(msg.what || '', msg.where || '');
    const layers = getLayersForType(type);
    // Preserve foundation answers already collected
    webview.postMessage({ type: 'bi-layers', layers, projectType: type });
    return true;
  }

  if (msg.type === 'bi-submit') {
    const spec: BlueprintSpec = msg.spec;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const projectName = vscode.workspace.workspaceFolders?.[0]?.name || 'Project';

    spec.completionScore = scoreBlueprint(spec);
    spec.summary = buildBlueprintSummary(spec, projectName);

    // Always write blueprint.md if we have a workspace root
    if (root) {
      const fs = require('fs');
      const path = require('path');
      const redivivusDir = path.join(root, '.redivivus');
      fs.mkdirSync(redivivusDir, { recursive: true });
      fs.writeFileSync(path.join(redivivusDir, 'blueprint.md'), spec.summary, 'utf8');
      // Also save to config if available
      try {
        const config = redivivus.loadConfig?.() || {};
        config.blueprintSpec = spec;
        redivivus.saveConfig?.(config);
      } catch (_) {}
    }

    webview.postMessage({ type: 'bi-done' });

    // Post a summary to chat
    const summaryMsg = `Blueprint complete — ${spec.completionScore}% coverage.\n\n` +
      `Project type detected: ${spec.projectType}\n\n` +
      spec.summary +
      `\n\nI'll use this blueprint as a constraint for everything I build. ` +
      `Ask me to start building, or say "review my blueprint" to discuss it.`;
    webview.postMessage({ type: 'append-message', role: 'assistant', content: summaryMsg });
    return true;
  }

  return false;
}
