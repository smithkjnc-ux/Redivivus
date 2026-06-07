// [SCOPE] Chat send-message: keyword shortcut intercepts fired before the AI classifier.
// Returns true if handled (caller returns immediately); false falls through to classifier.

import * as vscode from 'vscode';
import type { MessageHandlerDeps } from './chatPanelMessages';
import { ProjectOperations } from '../../services/project/projectOperations';
import { _scanRedivivusProjects } from '../../ui/redivivusProjectScanner';
import { markProjectClosed } from '../../services/project/closeMarker';

export async function handleKeywordShortcuts(
  userText: string,
  lowerText: string,
  deps: MessageHandlerDeps,
): Promise<boolean> {
  const { conversation, refresh, panel, redivivus } = deps;

  if (/what\s+templates|show.*templates|list.*templates|templates.*available|templates.*do\s+you\s+have|what\s+can\s+you\s+build|what\s+types.*build|what.*project.*types/i.test(lowerText)) {
    try {
      const { TEMPLATE_CATEGORIES } = await import('../../services/project/templateRegistry.js');
      const lines = ['**Redivivus Template Library** -- here\'s what I can build:\n', ...TEMPLATE_CATEGORIES.flatMap(cat => [`**${cat.label}** -- ${cat.description}`, ...cat.subcategories.map(sub => `  - **${sub.label}**: ${sub.description}${sub.tags?.length ? ' (' + sub.tags.slice(0, 3).join(', ') + ')' : ''}`)]), '\nJust say **"build me a [type]"** and I\'ll walk you through it.'];
      conversation.push({ role: 'assistant', content: lines.join('\n'), timestamp: Date.now() });
    } catch {
      conversation.push({ role: 'assistant', content: 'I have templates for **Websites**, **Games**, **Apps/Tools**, and **APIs/Backends**. Just say "build me a [type]" to start.', timestamp: Date.now() });
    }
    refresh(); return true;
  }

  // Run / open program — check BEFORE AI classifier to avoid vault/build path
  if (/^(run|open|launch|show|preview|view)\s+(it|the\s+(program|app|site|page|game|file|project|result|output)|my\s+(program|app|site|game))/i.test(lowerText) || lowerText.trim() === 'run it') {
    const _runRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (_runRoot) {
      const { detectPostBuildInfo } = await import('../build/chatPanelPostBuild.js');
      const _info = detectPostBuildInfo(_runRoot, []);
      if (_info.entryFile) {
        const _p = require('path') as typeof import('path');
        await vscode.env.openExternal(vscode.Uri.file(_p.join(_runRoot, _info.entryFile)));
        conversation.push({ role: 'assistant', content: `Opening \`${_info.entryFile}\` in your browser.`, timestamp: Date.now() });
        refresh(); return true;
      }
    }
  }

  if (/scan.*for\s+(problems?|issues?|errors?|bugs?|warnings?)|analyze\s+(the\s+)?project|check\s+(my\s+|the\s+)?project|find.*problems|project.*health|run\s+scan|scan\s+project/i.test(lowerText)) {
    conversation.push({ role: 'assistant', content: 'Running project scan now -- opening the Recommendations panel...', timestamp: Date.now() });
    refresh(); await vscode.commands.executeCommand('redivivus.analyze'); return true;
  }

  if (/retrofit.*blueprint|blueprint.*from.*code|blueprint.*from.*scan|figure\s+out\s+what.*project|what\s+does.*project\s+do|generate.*blueprint\s+from|scan.*generate.*blueprint|infer.*blueprint|auto.*blueprint/i.test(lowerText)) {
    conversation.push({ role: 'assistant', content: 'Scanning your project to infer a blueprint — takes about 30 seconds...', timestamp: Date.now() });
    refresh(); await vscode.commands.executeCommand('redivivus.retrofitBlueprint'); return true;
  }

  if (/translate.*vault|translate.*function.*to\s+\w+|translate.*snippet|convert.*vault.*to|port.*vault.*to|vault.*translate/i.test(lowerText)) {
    conversation.push({ role: 'assistant', content: 'Opening vault translator — pick an item and target language...', timestamp: Date.now() });
    refresh(); await vscode.commands.executeCommand('redivivus.vaultTranslate'); return true;
  }

  if (/what\s+(am\s+i\s+working|project\s+is\s+this)/i.test(lowerText)) {
    const info = await new ProjectOperations().getCurrentProjectInfo();
    conversation.push({ role: 'assistant', content: `**Current project:** ${info || 'No project info available'}`, timestamp: Date.now() });
    refresh(); return true;
  }

  if (/how'?s\s+my\s+setup|setup\s+progress|what'?s\s+left|what\s+to\s+do\s+next/i.test(lowerText)) {
    const _spRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (_spRoot && redivivus) {
      const { SetupProgressService } = await import('../../services/project/setupProgressService.js');
      const { showSetupProgressPanel } = await import('../../services/project/setupProgressPanel.js');
      const svc = new SetupProgressService(redivivus, _spRoot);
      const prog = await svc.getProgress();
      showSetupProgressPanel(prog, () => svc.getProgress());
      conversation.push({ role: 'assistant', content: `Setup progress panel opened. You're **${prog.percentage}% complete** (${prog.completedCount} of ${prog.totalCount} steps done).`, timestamp: Date.now() });
      refresh(); return true;
    }
  }

  if (/list.*project|show.*project|available.*project|my.*project|open.*project|switch.*project|change.*project/i.test(lowerText)) {
    const projects = _scanRedivivusProjects();
    // Try to match a specific project name if mentioned
    const nameMatch = lowerText.match(/open\s+(?:the\s+)?(.+?)\s+project/i);
    const named = nameMatch ? projects.find(p => p.name.toLowerCase().includes(nameMatch[1].toLowerCase())) : null;
    if (named) {
      conversation.push({ role: 'assistant', content: `Opening **${named.name}**...`, timestamp: Date.now() }); refresh();
      panel.webview.postMessage({ type: 'open-workspace-btn', path: named.fullPath });
    } else {
      const reply = projects.length ? `Found **${projects.length} project${projects.length === 1 ? '' : 's'}** -- opening the picker now.` : 'No Redivivus projects found in your projects directory.';
      conversation.push({ role: 'assistant', content: reply, timestamp: Date.now() }); refresh();
      if (projects.length) { panel.webview.postMessage({ type: 'show-projects-modal', projects }); }
    }
    return true;
  }

  if (/^(close|exit|leave)\s+(the\s+|this\s+)?(project|folder|workspace)|^close\s*project\s*$/i.test(lowerText.trim())) {
    const folders = vscode.workspace.workspaceFolders;
    conversation.push({ role: 'assistant', content: 'Closing project...', timestamp: Date.now() });
    refresh();
    const { ChatPanel } = await import('../../ui/panels/chat/chatPanel.js');
    // [FIX] Dispose the panel BEFORE removing workspace folders (matches redivivus.closeProject command).
    // Removing the last folder from a single-folder workspace causes a full window reload. If the panel
    // still exists at reload time, VS Code visually restores the orphaned tab and the deserializer +
    // auto-open timer race to create panels → duplicate tabs. By disposing first, the serializer has
    // nothing to restore and the auto-open timer creates exactly ONE fresh launcher panel.
    ChatPanel.close();
    // [FIX] Synchronous marker survives the reload that removing the last folder triggers — the async
    // globalState flag below loses that race, which let the auto-open timer create a DUPLICATE panel.
    markProjectClosed();
    await ChatPanel.extensionContext?.globalState.update('redivivus.userClosedProject', true);
    if (folders && folders.length > 0) {
      await vscode.workspace.updateWorkspaceFolders(0, folders.length);
    } else {
      await vscode.commands.executeCommand('workbench.action.closeFolder');
    }
    return true;
  }

  if (/explain.*files?|what.*files?|what.*folder|why.*extra.*code|what.*all.*this/i.test(lowerText)) {
    const _exRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (_exRoot) {
      const { explainProjectFiles } = await import('../../ui/panels/chat/chatPanelFileExplainer.js');
      conversation.push({ role: 'assistant', content: await explainProjectFiles(_exRoot), timestamp: Date.now() });
      refresh(); return true;
    }
  }

  return false;
}
