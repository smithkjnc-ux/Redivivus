// [SCOPE] CHASSIS Chat Panel Build Helpers — BuildContext type, vault resolvers, message helpers
// Extracted from chatPanelBuild.ts to keep that file under 200 lines.

import type { RoutingService } from '../../services/ai/routingService';
import type { VaultService } from '../../services/vault/vaultService';
import type { ChassisService } from '../../services/chassisService';
import type { UsageTracker } from '../../services/usageTracker';
import type { VaultSearchResult } from '../../services/vault/buildFromVaultSearch';
import type { ChatMessage } from '../../ui/panels/chat/chatPanelHtml';
import type { BlueprintContract } from '../../services/blueprint/blueprintContract';

export interface BuildContext {
  task: string; root: string; blueprintContext: string; vault?: VaultService; routing: RoutingService; conversation: ChatMessage[]; refresh: () => void; logError: (t: string, p: string, e: string, l: number) => void; postToWebview?: (msg: any) => void; onBuildFinished?: (t: string, f?: string[]) => void;
  chassis?: ChassisService;
  usageTracker?: UsageTracker;
  onClarifySubmit?: (answers: Record<string, string>) => void;
  buildStartMessage?: string;
  isFix?: boolean;
  precomputedVaultSearch?: VaultSearchResult;
  onBuildFailed?: (t: string, reason: string) => void;
  buildMode?: 'plan' | 'direct'; assistMode?: boolean;
  contract?: BlueprintContract;
  clarifyAnswers?: string;
}

// ── Vault-hit promise resolver — keyed by hitId, resolved by webview confirm/cancel ──
const _vaultHitResolvers = new Map<string, (result: boolean) => void>();

export function registerVaultHitResolver(hitId: string, resolve: (result: boolean) => void): void {
  _vaultHitResolvers.set(hitId, resolve);
}

// [FIX] result accepts string choice ('build-fresh'|'cancel'|'use-vault') from gate handler
export function resolveVaultHit(hitId: string, result: string | boolean): void {
  const resolver = _vaultHitResolvers.get(hitId);
  if (resolver) { _vaultHitResolvers.delete(hitId); resolver(result as any); }
}

// [RULE 18] AI classifier decides multi-file vs single-file — regex cannot reliably detect this from phrasing.
export async function isChunkedBuildRequest(task: string, routing: RoutingService): Promise<boolean> {
  // [RULE 18] Structural fast path: if the user mentions two or more distinct, unique files, it must be chunked/multi-file.
  const fileMatches = task.match(/\b[\w./-]+\.(ts|tsx|js|jsx|py|html|css|scss|json|go|rs)\b/gi) || [];
  const uniqueFiles = new Set(fileMatches.map(f => f.toLowerCase()));
  if (uniqueFiles.size > 1) { return true; }

  if (/\b(full[- ]?stack|multi[- ]?file|multiple\s+files|several\s+files)\b/i.test(task)) { return true; }
  try {
    const prompt = `Classify if this task requires writing or modifying MULTIPLE separate files, or just a SINGLE file.
Note: If the user wants to create a new file AND modify/import it in an existing file, that requires MULTIPLE files (multi).

Task: "${task}"

Reply with exactly one word: "single" or "multi"`;
    const res = await routing.prompt(prompt, 12_000);
    if (res.success && res.text) {
      const reply = res.text.trim().toLowerCase();
      if (reply.includes('multi')) { return true; }
      if (reply.includes('single')) { return false; }
    }
  } catch { /* fall through to safe default */ }
  return false;
}

export function updateLastMsg(ctx: BuildContext, content: string): void {
  const last = ctx.conversation[ctx.conversation.length - 1];
  if (last && last.role === 'assistant') {last.content = content;}
  else {ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now() });}
  ctx.refresh();
}

export function appendMsg(ctx: BuildContext, content: string): void {
  ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now() });
  ctx.refresh();
}

/** Stream code into the last message bubble line-by-line so the user sees it being written. */
export async function streamCodePreview(ctx: BuildContext, lines: string[], label: string): Promise<void> {
  const CHUNK = 8; const DELAY = 45;
  for (let i = CHUNK; i <= lines.length + CHUNK; i += CHUNK) {
    const visible = lines.slice(0, i);
    const more = lines.length > i ? `\n...` : '';
    updateLastMsg(ctx, `${label}\n\`\`\`\n${visible.join('\n')}${more}\n\`\`\``);
    if (i < lines.length) { await new Promise(r => setTimeout(r, DELAY)); }
  }
}

/** Returns a "+N / -N lines" diff summary when modifying an existing file. Empty string for new files. */
export function diffSummary(oldContent: string, newContent: string): string {
  if (!oldContent) { return ''; }
  const oldLines = new Set(oldContent.split('\n'));
  const newLines = new Set(newContent.split('\n'));
  const added   = newContent.split('\n').filter(l => l.trim() && !oldLines.has(l)).length;
  const removed = oldContent.split('\n').filter(l => l.trim() && !newLines.has(l)).length;
  if (added === 0 && removed === 0) { return '(no line changes)'; }
  return `+${added} / -${removed} lines`;
}
