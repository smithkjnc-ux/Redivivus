// [SCOPE] Header action helpers — extracted from chatPanelHeader.ts (Rule 9 split).
// Covers: getPrimaryAction (Preview vs Run detection) and getConfiguredProviders (roster pill).

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { ChatHeaderInfo } from './chatPanelHtml';

type PrimaryAction = ChatHeaderInfo['primaryAction'];

export function getPrimaryAction(workspaceRoot: string | undefined): PrimaryAction {
  let primaryAction: PrimaryAction = {
    label: 'Preview',
    actionAttr: 'data-action',
    actionValue: 'preview-show',
    tooltip: 'Live preview of your project',
    icon: '&#x25B6;'
  };

  const activeEditor = vscode.window.activeTextEditor;
  const activeFilePath = activeEditor?.document.uri.fsPath;

  if (activeFilePath) {
    const ext = path.extname(activeFilePath).toLowerCase();
    if (['.py', '.go', '.rs', '.sh', '.rb', '.php', '.java', '.c', '.cpp', '.cs'].includes(ext)) {
      primaryAction = { label: 'Run', actionAttr: 'data-cmd', actionValue: 'redivivus.runProject', tooltip: 'Run your project in the terminal', icon: '&#x25B6;' };
    }
  } else if (workspaceRoot) {
    try {
      const rootFiles = fs.readdirSync(workspaceRoot);
      const backendExts = ['.py', '.go', '.rs', '.sh', '.rb', '.php', '.java', '.c', '.cpp', '.cs'];
      const hasHtml = rootFiles.some((f: string) => f.endsWith('.html'));
      const hasBackend = rootFiles.some((f: string) => backendExts.some(e => f.endsWith(e)));
      const hasPackageJson = rootFiles.includes('package.json');
      const isNodeCli = hasPackageJson && !hasHtml;
      if ((hasBackend || isNodeCli) && !hasHtml) {
        primaryAction = { label: 'Run', actionAttr: 'data-cmd', actionValue: 'redivivus.runProject', tooltip: 'Run your project in the terminal', icon: '&#x25B6;' };
      }
    } catch {}
  }
  return primaryAction;
}

export function getConfiguredProviders(): ChatHeaderInfo['configuredProviders'] {
  const PROVIDER_META: Array<{ id: string; label: string; emoji: string; key: () => string | null }> = [
    { id: 'groq',     label: 'Groq',     emoji: '\u26A1', key: () => { try { const { getGroqKey }     = require('../../../services/ai/routingKeys.js'); return getGroqKey(); }     catch { return null; } } },
    { id: 'openai',   label: 'GPT-4o',   emoji: '\u25C6', key: () => { try { const { getOpenAIKey }   = require('../../../services/ai/routingKeys.js'); return getOpenAIKey(); }   catch { return null; } } },
    { id: 'deepseek', label: 'DeepSeek', emoji: '\u25BA', key: () => { try { const { getDeepseekKey } = require('../../../services/ai/routingKeys.js'); return getDeepseekKey(); } catch { return null; } } },
    { id: 'gemini',   label: 'Gemini',   emoji: '\u2B22', key: () => { try { const { getGeminiKey }   = require('../../../services/ai/routingKeys.js'); return getGeminiKey(); }   catch { return null; } } },
    { id: 'claude',   label: 'Claude',   emoji: '\uD83D\uDFE0', key: () => { try { const { getClaudeKey }  = require('../../../services/ai/routingKeys.js'); return getClaudeKey(); }  catch { return null; } } },
    { id: 'xai',      label: 'Grok',     emoji: '\u2736', key: () => { try { const { getXAIKey }      = require('../../../services/ai/routingKeys.js'); return getXAIKey(); }      catch { return null; } } },
    { id: 'kimi',     label: 'Kimi',     emoji: '\uD83C\uDF19', key: () => { try { const { getKimiKey }     = require('../../../services/ai/routingKeys.js'); return getKimiKey(); }     catch { return null; } } },
  ];
  const { modelsForProvider } = require('../../../services/ai/modelRegistry.js');
  return PROVIDER_META.filter(p => !!p.key()).map(({ id, label, emoji }) => ({
    id, label, emoji,
    models: (modelsForProvider(id) || []).map((m: { modelId: string; label: string; capability: number }) => ({ id: m.modelId, label: m.label, cap: m.capability })),
  }));
}

export function getVaultCounts(extensionContext: vscode.ExtensionContext | undefined): { vaultItemCount: number; vaultStarterCount: number } {
  try {
    const { VaultService } = require('../../../services/vault/vaultService.js');
    const v = new VaultService(extensionContext);
    const all = v.listItems() as Array<{ sourceProject?: string }>;
    const SEEDED = new Set(['redivivus-starter', 'redivivus-seeded']);
    const starters = all.filter(i => SEEDED.has(i.sourceProject || '')).length;
    return { vaultItemCount: all.length - starters, vaultStarterCount: starters };
  } catch { return { vaultItemCount: 0, vaultStarterCount: 0 }; }
}
