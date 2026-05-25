// [SCOPE] Architecture Map panel — Command Dispatcher for webview messages
import * as vscode from 'vscode';
import type { ProjectMap } from '../../services/mapBuilderService.js';
import type { GuardianService } from '../../services/ai/guardianService.js';
import { handleMapTimelineMessage } from './mapPanelTimelineMessages.js';

import { executeOpenFile } from './commands/openFileCommand.js';
import { executeMapChat } from './commands/mapChatCommand.js';
import { executeExplainFile } from './commands/explainFileCommand.js';
import { executeAnalyzeFile } from './commands/analyzeFileCommand.js';
import { executeFixFile } from './commands/fixFileCommand.js';
import { executeArchitectReview } from './commands/architectReviewCommand.js';
import { executeELI5 } from './commands/eli5Command.js';
import { executeRunCommand } from './commands/runCommand.js';

export interface MapMsgCtx {
  root: string;
  map: ProjectMap;
  webview: vscode.Webview;
  guardian: GuardianService;
  panel: vscode.WebviewPanel;
  refresh: () => void;
}

export async function handleMapMessage(msg: any, ctx: MapMsgCtx): Promise<void> {
  const { panel } = ctx;

  switch (msg.type) {
    case 'openFileAtSymbol':
    case 'openFile':
      return executeOpenFile(msg, ctx);
      
    case 'mapChat':
    case 'chatAbout':
      return executeMapChat(msg, ctx);
      
    case 'explainFile':
      return executeExplainFile(msg, ctx);
      
    case 'analyzeFile':
      return executeAnalyzeFile(msg, ctx);
      
    case 'fixFile':
      return executeFixFile(msg, ctx);
      
    case 'architectReview':
      return executeArchitectReview(msg, ctx);
      
    case 'runCommand':
      return executeRunCommand(msg, ctx);
      
    case 'getELI5':
      return executeELI5(msg, ctx);
      
    case 'delegateAnnotation': {
      const promptText = msg.prompt || `[${msg.tag}] in \`${msg.nodeId}\`: ${msg.text}\n\nPlease address this annotation.`;
      await vscode.commands.executeCommand('redivivus.openChat');
      await vscode.commands.executeCommand('redivivus.postToChat', promptText);
      return;
    }

    case 'back-to-chat':
      panel.dispose();
      await vscode.commands.executeCommand('redivivus.openChat');
      return;
      
    case 'refresh':
      ctx.refresh();
      return;
      
    default:
      if (msg.type?.startsWith('tl-')) {
        await handleMapTimelineMessage(msg, ctx);
      }
      return;
  }
}
