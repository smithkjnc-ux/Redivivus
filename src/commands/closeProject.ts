// [SCOPE] Close Project command — deactivates the active project and returns to HOME launcher.
// Extracted from extensionCommands.ts (Rule 9 split).
// [WARN] Disposes panel BEFORE removing workspace folders — avoids duplicate tab on single-folder
//        workspace reload. See extensionCommands.ts [FIX] comment for full explanation.

import * as vscode from 'vscode';
import { markProjectClosed } from '../services/project/closeMarker.js';
import { ChatPanel } from '../ui/panels/chat/chatPanel.js';

export function registerCloseProjectCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.closeProject', async () => {
      markProjectClosed();
      // [Model A] "Close Project" = deactivate the active subfolder and drop back to HOME launcher.
      // Do NOT remove ~/projects from the workspace — that left "NO FOLDER OPENED".
      try {
        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const { isProjectsContainer } = require('../services/project/redivivusPaths.js');
        if (wsRoot && isProjectsContainer(wsRoot)) {
          const PFP = require('../ui/sidebar/projectFilesProvider.js').ProjectFilesProvider;
          PFP.instance?.setRoot(wsRoot);
          try { require('../core/project/projectFolderDecorations.js').refreshProjectFolderDecorations(); } catch {}
          try { import('../core/project/projectFocusMode.js').then(m => m.clearFocus()).catch(() => {}); } catch {}
          const cp = ChatPanel.currentPanel as any;
          if (cp?.state) { cp.state.conversation = []; cp._initialized = false; cp.refresh?.(); }
          return;
        }
      } catch { /* fall through to legacy close */ }
      // Legacy fallback (workspace is a standalone folder, not the projects home): close the folder.
      ChatPanel.close();
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) { await vscode.workspace.updateWorkspaceFolders(0, folders.length); }
    })
  );
}
