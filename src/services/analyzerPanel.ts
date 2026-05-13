// [SCOPE] CHASSIS Recommendations webview panel — creates the panel and wires up message handling
// Section HTML is built in analyzerSections.ts. This file is panel lifecycle only.
import * as vscode from 'vscode';
import * as path from 'path';
import { AnalysisResult } from './analyzerTypes.js';
import {
  buildOverviewSection, buildLargeFilesSection, buildTodosSection,
  buildUncommentedSection, buildNextStepsSection
} from './analyzerSections.js';
import { buildRecommendationsHtml } from './analyzerHtml.js';
import { markResolved } from './resolvedItems.js';

export function showRecommendationsPanel(result: AnalysisResult): void {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const projectName = path.basename(root) || 'this project';
 
  RecommendationsPanel.show(result, projectName);
}

export class RecommendationsPanel {
  private static _instance: RecommendationsPanel | undefined;
  public static get currentPanel(): RecommendationsPanel | undefined { return RecommendationsPanel._instance; }
  private _panel: vscode.WebviewPanel;

  public static show(result: AnalysisResult, projectName: string): void {
    if (RecommendationsPanel._instance) {
      RecommendationsPanel._instance._panel.reveal(vscode.ViewColumn.Beside);
      RecommendationsPanel._instance._update(result, projectName);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'chassisRecommendations', 'CHASSIS Recommendations',
      vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true }
    );
    RecommendationsPanel._instance = new RecommendationsPanel(panel, result, projectName);
  }

  private constructor(panel: vscode.WebviewPanel, result: AnalysisResult, projectName: string) {
    this._panel = panel;
    this._panel.onDidDispose(() => { RecommendationsPanel._instance = undefined; });
    this._update(result, projectName);
    this._panel.webview.onDidReceiveMessage(msg => this._handleMessage(msg));
  }

  public postMessage(msg: any): void { this._panel.webview.postMessage(msg); }

  private _update(result: AnalysisResult, projectName: string): void {
    const sections = [
      buildOverviewSection(result),
      buildLargeFilesSection(result),
      buildTodosSection(result, projectName),
      buildUncommentedSection(result, projectName),
      buildNextStepsSection(result, projectName),
    ].join('\n');

    this._panel.webview.html = buildRecommendationsHtml(sections);
  }

  private async _handleMessage(msg: any): Promise<void> {
    if (msg.type === 'sendToChat' && typeof msg.prompt === 'string') {
      this._panel.webview.postMessage({ type: 'buildStarted', fileName: msg.fileName });
      try {
        const issueType = msg.issueType || 'largeFile';
        // [CHASSIS] Strip "# CHASSIS Review — " and similar heading prefixes from filenames
        const rawFileName: string = msg.fileName || '';
        const cleanFileName = rawFileName.startsWith('batch-')
          ? rawFileName  // keep batch marker as-is
          : rawFileName.replace(/^#[^—\-]*[—\-]\s*/, '').trim();
        if ((issueType === 'todo' || issueType === 'uncommented') && cleanFileName && !cleanFileName.startsWith('batch-')) {
          // [CHASSIS] Edit existing file in-place — skip vault search, skip new-file creation
          await vscode.commands.executeCommand('chassis.runEditFix', msg.prompt, cleanFileName, issueType);
        } else if ((issueType === 'todo' || issueType === 'uncommented') && cleanFileName.startsWith('batch-')) {
          // [CHASSIS] Fix All batch for todo/uncommented — parse filePath from the prompt itself
          await vscode.commands.executeCommand('chassis.runEditFix', msg.prompt, null, issueType);
        } else {
          // [CHASSIS] Large file split or unknown — use existing new-file build pipeline
          await vscode.commands.executeCommand('chassis.postToChat', msg.prompt);
        }
      } catch (err) {
        this._panel.webview.postMessage({ type: 'clipboardError' });
      }
    } else if (msg.type === 'verifyFix' && msg.filePath && msg.issueType) {
      // [CHASSIS] Persist the resolution so it survives re-scans
      markResolved(msg.filePath, msg.issueType);
      const result = await vscode.commands.executeCommand('chassis.verifyFix', msg.filePath, msg.issueType);
      this._panel.webview.postMessage({ type: 'verifyFixResult', result, rowId: msg.rowId });
    } else if (msg.type === 'copyToClipboard' && msg.text) {
      try {
        await vscode.env.clipboard.writeText(msg.text);
        this._panel.webview.postMessage({ type: 'clipboardCopied' });
      } catch (err) {
        this._panel.webview.postMessage({ type: 'clipboardError' });
      }
    } else if (msg.type === 'markResolved' && msg.filePath && msg.issueType) {
      // [CHASSIS] Explicit Done-button persist — called from webview when user clicks ✓ Done
      markResolved(msg.filePath, msg.issueType);
    }
  }
}
