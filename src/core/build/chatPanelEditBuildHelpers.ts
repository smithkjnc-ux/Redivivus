// [SCOPE] Edit-file build helpers — EditBuildContext type, excerpt extraction, vault save, message utils
// Used exclusively by chatPanelEditBuild.ts. Do not import directly from elsewhere.

import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import type { VaultService } from '../../services/vault/vaultService';
import type { ChatMessage } from '../../ui/panels/chat/chatPanelHtml';

export interface EditBuildContext {
  filePath: string;
  task: string;
  issueType: string;
  root: string;
  blueprintContext?: string;
  routing: import('../../services/ai/routingService').RoutingService;
  vault?: VaultService;
  conversation: ChatMessage[];
  refresh: () => void;
  logError: (task: string, prompt: string, error: string, promptLen: number) => void;
  onBuildFinished?: (task: string, builtFiles?: string[]) => void;
  onBuildFailed?: (task: string, reason: string) => void;
}

export function parseLineNum(task: string): number | null {
  const m = task.match(/line\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

export function extractExcerpt(lines: string[], lineNum: number, window = 80): { start: number; end: number; excerpt: string } {
  const idx = Math.max(0, lineNum - 1);
  const start = Math.max(0, idx - window);
  const end = Math.min(lines.length - 1, idx + window);
  const excerpt = lines.slice(start, end + 1)
    .map((l, i) => `${start + i + 1}: ${l}`)
    .join('\n');
  return { start, end, excerpt };
}

export function spliceExcerpt(lines: string[], start: number, end: number, newExcerpt: string): string {
  const newLines = newExcerpt.split('\n').map(l => l.replace(/^\d+:\s?/, ''));
  return [...lines.slice(0, start), ...newLines, ...lines.slice(end + 1)].join('\n');
}

export async function saveNewBlocksToVault(absPath: string, vault: VaultService): Promise<number> {
  try {
    const content = fs.readFileSync(absPath, 'utf-8');
    const { items } = vault.extractFromFile(absPath, content);
    let saved = 0;
    for (const item of items) {
      if (item.contentHash && !vault.isDuplicate(item.contentHash)) {
        vault.saveItem(item);
        saved++;
      }
    }
    return saved;
  } catch { return 0; }
}

export function updateLastMsg(ctx: EditBuildContext, content: string): void {
  const last = ctx.conversation[ctx.conversation.length - 1];
  if (last && last.role === 'assistant') { last.content = content; }
  else { ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now() }); }
  ctx.refresh();
}

export function appendMsg(ctx: EditBuildContext, content: string): void {
  ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now() });
  ctx.refresh();
}
