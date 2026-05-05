// [SCOPE] CHASSIS Chat Panel Build Pipeline — vault search, auto-chunking, clarification, error logging
// Handles all build/create requests from the chat panel.
//   Fix 1: Full error logging to .chassis/build_errors.log with real reason shown in chat
//   Fix 2: Auto-chunking for large/complete requests (build plan → per-file builds with progress)
//   Fix 3: Visible vault search step shown in chat before every build
//   Clarify: 3-5 AI questions shown as a form before multi-file builds — answers injected into prompts

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RoutingService } from '../services/routingService.js';
import { VaultService } from '../services/vaultService.js';
import { findRelevantByTask } from '../services/buildFromVaultSearch.js';
import { ChatMessage } from './chatPanelHtml.js';

// [WARN] These keywords trigger auto-chunking — request will be broken into a multi-file build plan
const CHUNK_TRIGGER_WORDS = ['complete', 'full', 'entire', 'whole', 'everything', 'all features'];

export interface BuildContext {
  task: string;
  root: string;
  blueprintContext: string;
  vault?: VaultService;
  routing: RoutingService;
  conversation: ChatMessage[];
  refresh: () => void;
  logError: (task: string, prompt: string, error: string, promptLen: number) => void;
  // [WARN] postToWebview + onClarifySubmit are required for the clarification flow in chunked builds
  postToWebview?: (msg: any) => void;
  onClarifySubmit?: (answers: Record<string, string>) => void;
}

/** Returns true if task triggers multi-file chunked build */
export function isChunkedBuildRequest(task: string): boolean {
  const t = task.toLowerCase();
  return CHUNK_TRIGGER_WORDS.some(w => t.includes(w));
}

/** Infer file extension from task text and blueprint WHERE */
export function inferExtension(taskLow: string, where: string): string {
  return taskLow.includes('python') || taskLow.includes('.py') ? '.py'
    : taskLow.includes('rust') || taskLow.includes('.rs') ? '.rs'
    : taskLow.includes(' go ') || taskLow.includes('golang') ? '.go'
    : taskLow.includes('html') ? '.html'
    : taskLow.includes('css') && !taskLow.includes('scss') ? '.css'
    : taskLow.includes('scss') ? '.scss'
    : taskLow.includes('javascript') || / \bjs\b/.test(taskLow) ? '.js'
    : taskLow.includes('typescript') || / \bts\b/.test(taskLow) ? '.ts'
    : taskLow.includes('react') || taskLow.includes('tsx') ? '.tsx'
    : where.includes('python') ? '.py'
    : where.includes('react') || where.includes('tsx') ? '.tsx'
    : where.includes('javascript') || where.includes('node') ? '.js'
    : where.includes('rust') ? '.rs'
    : where.includes('go') ? '.go'
    : '.ts';
}

/** Derive a clean filename slug from task text */
export function deriveFileBase(taskLow: string): string {
  const langWords = new Set(['python','javascript','typescript','react','html','css','scss','rust','golang','go','node','nodejs','js','ts','tsx']);
  const stopSet = new Set(['build','create','make','write','add','generate','implement','scaffold','me','a','an','the','that','for','with','using','simple','basic','just','some','new','my','complete','full','entire','whole','everything','based','on','blueprint']);
  const words = taskLow.replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w => w.length > 1 && !stopSet.has(w) && !langWords.has(w));
  return words.slice(0, 4).join('_') || 'output';
}

/** Update the last assistant message content and refresh */
function updateLastMsg(ctx: BuildContext, content: string): void {
  const last = ctx.conversation[ctx.conversation.length - 1];
  if (last && last.role === 'assistant') { last.content = content; }
  else { ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now() }); }
  ctx.refresh();
}

/** Append a new assistant message and refresh */
function appendMsg(ctx: BuildContext, content: string, tokens = 0, cost = 0): void {
  ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now(), tokens: tokens || undefined, cost: cost || undefined });
  ctx.refresh();
}

/** Single-file build — vault search visible, then build, then result */
export async function runSingleFileBuild(ctx: BuildContext): Promise<void> {
  const { task, root, blueprintContext, vault, routing, conversation } = ctx;
  const taskLow = task.toLowerCase();

  // Fix 3: Show vault search step
  appendMsg(ctx, '🔍 Searching vault...');
  const vaultItems = vault ? vault.listItems() : [];
  const relevant = vaultItems.length > 0 ? findRelevantByTask(task, vaultItems) : [];
  updateLastMsg(ctx, `🔍 Searching vault... found ${relevant.length} matching item${relevant.length !== 1 ? 's' : ''}`);

  // Fix 3: Show planning step
  appendMsg(ctx, '📋 Planning build...');
  const config = vscode.workspace.workspaceFolders ? null : null; // resolved via blueprintContext
  const where = blueprintContext.match(/Where: (.+)/)?.[1]?.toLowerCase() || '';
  const ext = inferExtension(taskLow, where);
  const fileBase = deriveFileBase(taskLow);
  const relPath = `src/${fileBase}${ext}`;
  const absPath = path.join(root, relPath);
  updateLastMsg(ctx, `📋 Planning build... → \`${relPath}\``);

  // Fix 3: Show build step
  appendMsg(ctx, '⚙️ Building...');

  const vaultSummary = relevant.slice(0, 8).map(i =>
    `// FROM VAULT [${i.category}]: ${i.name}\n${i.code}`
  ).join('\n\n');

  const buildPrompt = `You are CHASSIS, a code generation assistant. Generate complete, working, production-ready code.

TASK: "${task}"
TARGET FILE: ${relPath}
${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}` : ''}
${vaultSummary ? `VAULT CODE (reuse where relevant):\n${vaultSummary}` : ''}

RULES:
- Write code that works immediately without configuration or placeholder values.
- Use real libraries, real APIs, and real implementations. No placeholder URLs, no example.com, no TODO stubs.
- Add a [SCOPE] comment at the top describing what this module does.
- Return ONLY the code — no markdown fences, no explanation, no preamble.`;

  const promptLen = Math.ceil(buildPrompt.length / 4);
  let code: string;
  let buildTokens = 0;
  let buildCost = 0;

  try {
    const res = await routing.prompt(buildPrompt);
    if (!res.success) { throw new Error(res.error || 'AI generation failed'); }
    code = res.text.replace(/^```[a-zA-Z]*\n?/m, '').replace(/\n?```$/m, '').trim();
    if (!code) { throw new Error('AI returned an empty response. The prompt may be too large or the model may have refused the request.'); }
    buildTokens = Math.ceil(res.text.length / 4);
    buildCost = (buildTokens / 1_000_000) * 0.30;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // Fix 1: log full details + show real reason in chat
    ctx.logError(task, buildPrompt, errMsg, promptLen);
    conversation.pop(); // remove ⚙️ Building...
    conversation.pop(); // remove 📋 Planning...
    conversation.pop(); // remove 🔍 Searching...
    appendMsg(ctx,
      `❌ Build failed\n\n**Reason:** ${errMsg}\n\n_Prompt was ~${promptLen} tokens. Full details in \`.chassis/build_errors.log\`_`
    );
    return;
  }

  try {
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(absPath, code, 'utf8');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    ctx.logError(task, buildPrompt, `File write failed: ${errMsg}`, promptLen);
    conversation.pop();
    conversation.pop();
    conversation.pop();
    appendMsg(ctx,
      `❌ Could not write \`${relPath}\`\n\n**Reason:** ${errMsg}\n\n_Full details in \`.chassis/build_errors.log\`_`
    );
    return;
  }

  // Replace last progress msg with result
  conversation.pop(); // remove ⚙️ Building...
  conversation.pop(); // remove 📋 Planning...
  conversation.pop(); // remove 🔍 Searching...
  const vaultNote = relevant.length > 0 ? `, ${relevant.length} vault item(s) used` : '';
  appendMsg(ctx,
    `✅ Created \`${relPath}\`${vaultNote}\n__BUILD_RESULT__${relPath}|||${absPath}|||END__`,
    buildTokens, buildCost
  );
}

export { runChunkedBuild } from './chatPanelChunked.js';
