// [SCOPE] Architecture Map message handler for the Redivivus dashboard
// Routes map-specific messages from the Webview back to VS Code commands.

import * as vscode from 'vscode';
import * as path from 'path';
import type { WizardPanelState } from './messageRouterTypes.js';
import type { GuardianService } from '../../../features/ai/data/guardianService.js';

export async function handleMapMessage(
  msg: any,
  state: WizardPanelState,
  guardian: GuardianService,
  refresh: () => void,
  webview: vscode.Webview,
  intentService?: any
): Promise<boolean> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {return false;}

  switch (msg.type) {
    case 'openFile':
      if (msg.nodeId) {
        try {
          const uri = vscode.Uri.file(path.join(root, msg.nodeId));
          await vscode.window.showTextDocument(uri, { preserveFocus: false });
        } catch { vscode.window.showErrorMessage(`Redivivus Map: Could not open ${msg.nodeId}`); }
      }
      return true;

    case 'chatAbout':
      if (msg.nodeId) {
        const node = state.mapData?.nodes?.find((n: any) => n.id === msg.nodeId);
        // [WARN] Use redivivus.mapContextChat — NOT redivivus.postToChat. postToChat routes through
        //        fix-request → build pipeline and can trigger vault modal for Q&A messages.
        await vscode.commands.executeCommand('redivivus.mapContextChat', {
          nodeId: msg.nodeId,
          label: node?.label || '',
          lines: node?.lines ?? 0,
          health: node?.health ?? 'neutral',
          todos: node?.todos ?? 0,
        });
      }
      return true;

    case 'runCommand':
      if (msg.nodeId && msg.command) {
        try {
          const uri = vscode.Uri.file(path.join(root, msg.nodeId));
          await vscode.window.showTextDocument(uri, { preserveFocus: false });
          await vscode.commands.executeCommand(msg.command);
        } catch { vscode.window.showErrorMessage(`Redivivus Map: Could not open ${msg.nodeId}`); }
      }
      return true;

    case 'fixFile':
      if (msg.nodeId) {
        const node = state.mapData?.nodes?.find((n: any) => n.id === msg.nodeId);
        const issueType = msg.issueType || (node && node.lines > 200 ? 'largeFile' : node && node.todos > 0 ? 'todo' : 'uncommented');
        const task = issueType === 'largeFile'
          ? `Split ${msg.nodeId} (${node?.lines} lines) into smaller files under 200 lines each.`
          : issueType === 'todo'
          ? `Review and implement the TODO markers in ${msg.nodeId}.`
          : `Add a [SCOPE] comment at the top of ${msg.nodeId} explaining what this file does.`;
        await vscode.commands.executeCommand('redivivus.runEditFix', task, msg.nodeId, issueType);
      }
      return true;

    case 'getELI5':
      if (msg.nodeId && state.mapData) {
        const node = state.mapData.nodes.find((n: any) => n.id === msg.nodeId);
        if (node) {
          const technical = `File health is ${node.health}. Issues: ${node.todos} TODOs, ${node.warns} WARNs. Lines: ${node.lines}. matchesBlueprint: ${node.matchesBlueprint}`;
          const eli5 = guardian.translateToELI5(technical, 'map-hover');
          webview.postMessage({ type: 'eli5-response', nodeId: msg.nodeId, text: eli5.plainEnglish });
        }
      }
      return true;

    case 'confirmIntent':
      if (msg.nodeId && intentService) {
        if (msg.confirmType === 'file') {
          intentService.confirmComplexFile(msg.nodeId);
        } else if (msg.confirmType === 'route' && msg.toNodeId) {
          intentService.confirmScenicRoute(`${msg.nodeId}→${msg.toNodeId}`);
        }
        refresh();
      }
      return true;
      
    case 'clearIntent':
      if (msg.nodeId && intentService) {
        intentService.clearIntent(msg.nodeId);
        refresh();
      }
      return true;

    default:
      return false;
  }
}
