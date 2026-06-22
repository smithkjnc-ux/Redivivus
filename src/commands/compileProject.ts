// [SCOPE] Compile Project command — triggered by "Package as Executable" action card button.
// Extracted from extensionCommands.ts (Rule 9 split).

import * as vscode from 'vscode';

export function registerCompileProjectCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.compileProject', async () => {
      const { _lastCompileTarget, runCompilePipeline, getCompilePipeline } = require('../ui/chat/chatPanelBuildPipeline.js');
      let target = _lastCompileTarget;
      if (!target) {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) { vscode.window.showWarningMessage('No project open — open a project folder first.'); return; }
        const fs = require('fs'), path = require('path');
        const exts = ['.py', '.rs', '.go', '.c', '.cpp'];
        const srcDir = path.join(root, 'src');
        const searchDirs = [srcDir, root].filter((d: string) => fs.existsSync(d));
        let found: string | null = null;
        for (const dir of searchDirs) {
          const files: string[] = fs.readdirSync(dir).filter((f: string) => exts.some((e: string) => f.endsWith(e)));
          if (files.length) { found = path.join(dir, files[0]); break; }
        }
        if (!found) { vscode.window.showWarningMessage('No compilable file found (.py, .rs, .go, .c, .cpp).'); return; }
        const relPath = require('path').relative(root, found);
        const pipeline = getCompilePipeline(relPath, root);
        if (!pipeline) { vscode.window.showWarningMessage('No compile pipeline for this file type.'); return; }
        target = { root, relPath, pipeline };
      }
      runCompilePipeline(target.pipeline, target.root);
    })
  );
}
