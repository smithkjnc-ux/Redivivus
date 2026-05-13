// [SCOPE] Edit-file build pipeline — patches existing files in-place for Fix This (TODO / scope fixes).
// Unlike runSingleFileBuild (which creates new files), this reads, patches, and writes back the original.
// After a successful fix, new code blocks are extracted and saved to the vault (dedup by content hash).
// [WARN] Large files use excerpt mode — only ±80 lines around the target line are sent to AI, then spliced back.

import * as path from 'path';
import * as fs from 'fs';
import { RoutingService } from '../services/routingService.js';
import { VaultService } from '../services/vaultService.js';
import { ChatMessage } from './chatPanelHtml.js';

export interface EditBuildContext {
  filePath: string;    // relative path from workspace root
  task: string;        // the original fix prompt
  issueType: string;   // 'todo' | 'uncommented'
  root: string;
  routing: RoutingService;
  vault?: VaultService;
  conversation: ChatMessage[];
  refresh: () => void;
  logError: (task: string, prompt: string, error: string, promptLen: number) => void;
  onBuildFinished?: (task: string, builtFiles?: string[]) => void;
  onBuildFailed?: (task: string, reason: string) => void;
}

// [SCOPE] Parse a 1-based line number from "Look at X line 66." style prompts
function parseLineNum(task: string): number | null {
  const m = task.match(/line\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

// [SCOPE] Extract ±window lines centred on lineNum (1-based), with line numbers prefixed
function extractExcerpt(lines: string[], lineNum: number, window = 80): { start: number; end: number; excerpt: string } {
  const start = Math.max(0, lineNum - window - 1);
  const end   = Math.min(lines.length - 1, lineNum + window - 1);
  const excerpt = lines.slice(start, end + 1)
    .map((l, i) => `${start + i + 1}: ${l}`)
    .join('\n');
  return { start, end, excerpt };
}

// [SCOPE] Splice a modified excerpt back — strips any "NNN: " line-number prefixes the AI may have echoed
function spliceExcerpt(lines: string[], start: number, end: number, newExcerpt: string): string {
  const newLines = newExcerpt.split('\n').map(l => l.replace(/^\d+:\s?/, ''));
  return [...lines.slice(0, start), ...newLines, ...lines.slice(end + 1)].join('\n');
}

// [SCOPE] Extract new blocks from the modified file and save any that are not already in the vault
async function saveNewBlocksToVault(absPath: string, vault: VaultService): Promise<number> {
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
  } catch {
    return 0; // [WARN] vault save is best-effort — never block the fix on vault errors
  }
}

function updateLastMsg(ctx: EditBuildContext, content: string): void {
  const last = ctx.conversation[ctx.conversation.length - 1];
  if (last && last.role === 'assistant') { last.content = content; }
  else { ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now() }); }
  ctx.refresh();
}

function appendMsg(ctx: EditBuildContext, content: string): void {
  ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now() });
  ctx.refresh();
}

// [SCOPE] Main entry point — called instead of runSingleFileBuild for todo/uncommented fix types
export async function runEditFileBuild(ctx: EditBuildContext): Promise<void> {
  const { filePath, task, issueType, root, routing, vault, conversation } = ctx;
  const absPath = path.join(root, filePath);

  // ── 1. Read the file ──────────────────────────────────────────────
  let originalContent: string;
  try {
    originalContent = fs.readFileSync(absPath, 'utf-8');
  } catch (err) {
    const msg = `❌ Could not read \`${filePath}\`: ${err instanceof Error ? err.message : String(err)}`;
    appendMsg(ctx, msg);
    if (ctx.onBuildFailed) { ctx.onBuildFailed(task, String(err)); }
    return;
  }

  const lines = originalContent.split('\n');

  // ── 2. Build a lean targeted prompt ──────────────────────────────
  let editPrompt: string;
  let useExcerpt = false;
  let excerptStart = 0, excerptEnd = lines.length - 1;

  if (issueType === 'todo') {
    const lineNum = parseLineNum(task);
    if (lineNum && lines.length > 200) {
      // [WARN] Large file — send only the relevant excerpt to stay under token limits
      const ex = extractExcerpt(lines, lineNum);
      excerptStart = ex.start; excerptEnd = ex.end;
      useExcerpt = true;
      editPrompt =
        `Edit this excerpt from \`${filePath}\` (lines ${ex.start + 1}–${ex.end + 1}):\n\`\`\`\n${ex.excerpt}\n\`\`\`\n\n` +
        `TASK: ${task}\n\n` +
        `RULES:\n` +
        `- Return ONLY the modified excerpt (same line range, no fences, no explanation)\n` +
        `- Change [TODO] to [DONE] once the task is implemented\n` +
        `- Preserve all other [SCOPE], [WARN], [NEXT], [DEAD] annotations exactly\n` +
        `- Write real, working code — no placeholders or stubs`;
    } else {
      editPrompt =
        `Edit this file \`${filePath}\`:\n\`\`\`\n${originalContent}\n\`\`\`\n\n` +
        `TASK: ${task}\n\n` +
        `RULES:\n` +
        `- Return ONLY the complete updated file (no fences, no explanation)\n` +
        `- Change [TODO] to [DONE] once implemented\n` +
        `- Preserve all other annotations exactly\n` +
        `- Write real, working code — no placeholders`;
    }
  } else {
    // issueType === 'uncommented' — add [SCOPE] / [WARN] tags, never modify logic
    editPrompt =
      `Add CHASSIS annotation comments to \`${filePath}\`:\n\`\`\`\n${originalContent}\n\`\`\`\n\n` +
      `TASK: ${task}\n\n` +
      `RULES:\n` +
      `- Return ONLY the complete updated file (no fences, no explanation)\n` +
      `- Add \`// [SCOPE]\` at line 1 describing what this file does in one sentence\n` +
      `- Add \`// [WARN]\` near any fragile, risky, or side-effect-heavy logic\n` +
      `- Do NOT change any existing code — comments only`;
  }

  appendMsg(ctx, `📂 Editing \`${filePath}\`...`);

  const promptLen = Math.ceil(editPrompt.length / 4);
  let newContent: string;

  // ── 3. Call AI ────────────────────────────────────────────────────
  try {
    const res = await routing.routeByComplexity(task, editPrompt, 90_000);
    if (!res.success) { throw new Error(res.error || 'AI generation failed'); }
    const result = res.text.replace(/^```[a-zA-Z]*\n?/m, '').replace(/\n?```$/m, '').trim();
    if (!result) { throw new Error('AI returned an empty response — the file may be too large.'); }
    newContent = useExcerpt ? spliceExcerpt(lines, excerptStart, excerptEnd, result) : result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    ctx.logError(task, editPrompt, errMsg, promptLen);
    conversation.pop(); // remove "📂 Editing..."
    appendMsg(ctx, `❌ Edit failed\n\n**Reason:** ${errMsg}\n\n_Prompt was ~${promptLen} tokens. Full details in \`.chassis/build_errors.log\`_`);
    if (ctx.onBuildFailed) { ctx.onBuildFailed(task, errMsg); }
    return;
  }

  // ── 4. Write back to the same file ───────────────────────────────
  try {
    fs.writeFileSync(absPath, newContent, 'utf-8');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    ctx.logError(task, editPrompt, `Write failed: ${errMsg}`, promptLen);
    appendMsg(ctx, `❌ Could not write \`${filePath}\`\n\n**Reason:** ${errMsg}`);
    if (ctx.onBuildFailed) { ctx.onBuildFailed(task, errMsg); }
    return;
  }

  // ── 5. Save new blocks to vault (deduped by content hash) ────────
  let vaultMsg = '';
  if (vault) {
    const saved = await saveNewBlocksToVault(absPath, vault);
    if (saved > 0) {
      vaultMsg = `\n💾 Saved **${saved}** new code block${saved !== 1 ? 's' : ''} to vault`;
    }
  }

  // ── 6. Done ───────────────────────────────────────────────────────
  updateLastMsg(ctx, `✅ Fixed \`${filePath}\`${vaultMsg}`);
  if (ctx.onBuildFinished) { ctx.onBuildFinished(task, [filePath]); }
}
