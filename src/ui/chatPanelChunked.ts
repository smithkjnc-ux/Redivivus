// [SCOPE] CHASSIS Chat Panel Chunked Build — multi-file build pipeline with clarification, plan, per-file progress

import * as path from 'path';
import * as fs from 'fs';
import { findRelevantByTask } from '../services/buildFromVaultSearch.js';
import { BuildContext } from './chatPanelBuild.js';
import { generateClarifyQuestions, encodeClarifyToken, formatAnswersForPrompt } from './chatPanelClarify.js';

function appendMsg(ctx: BuildContext, content: string, tokens = 0, cost = 0): void {
  ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now(), tokens: tokens || undefined, cost: cost || undefined });
  ctx.refresh();
}

function updateLastMsg(ctx: BuildContext, content: string): void {
  const last = ctx.conversation[ctx.conversation.length - 1];
  if (last && last.role === 'assistant') { last.content = content; }
  else { ctx.conversation.push({ role: 'assistant', content, timestamp: Date.now() }); }
  ctx.refresh();
}

/** Multi-file chunked build — clarify → vault search → plan → per-file builds with visible progress */
export async function runChunkedBuild(ctx: BuildContext): Promise<void> {
  const { task, root, blueprintContext, vault, routing, conversation } = ctx;

  // Clarification step: ask AI for questions, show form, wait for answers
  let answersBlock = '';
  if (ctx.postToWebview) {  // onClarifySubmit is set inside the Promise below — check only postToWebview
    appendMsg(ctx, '🤔 Preparing a few quick questions...');
    const questions = await generateClarifyQuestions(task, blueprintContext, routing);
    if (questions.length > 0) {
      // Replace thinking message with the clarify form token
      const last = conversation[conversation.length - 1];
      if (last && last.role === 'assistant') { last.content = encodeClarifyToken(questions); }
      ctx.refresh();
      // Suspend — wait for user to submit the form
      const answers = await new Promise<Record<string, string>>((resolve) => {
        ctx.onClarifySubmit = resolve;
      });
      answersBlock = formatAnswersForPrompt(answers);
      // Replace form with a compact summary of choices
      const summary = Object.entries(answers).map(([q, a]) => `  • ${q}: **${a}**`).join('\n');
      const last2 = conversation[conversation.length - 1];
      if (last2 && last2.role === 'assistant') { last2.content = `✅ Got it — building with your choices:\n${summary}`; }
      ctx.refresh();
    } else {
      // AI returned no questions — remove thinking message and proceed
      conversation.pop();
      ctx.refresh();
    }
  }

  // Fix 3: Show vault search step
  appendMsg(ctx, '🔍 Searching vault...');
  const vaultItems = vault ? vault.listItems() : [];
  const relevant = vaultItems.length > 0 ? findRelevantByTask(task, vaultItems) : [];
  updateLastMsg(ctx, `🔍 Searching vault... found ${relevant.length} matching item${relevant.length !== 1 ? 's' : ''}`);

  // Fix 3: Show planning step
  appendMsg(ctx, '📋 Planning build — asking AI for file list...');

  // Plan prompt: intentionally minimal — no vault snippets, no code request, just the file list
  // [WARN] Keeping this small prevents timeouts on the planning step
  const planPrompt = `I need to build: "${task}"
${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}\n` : ''}${answersBlock ? `${answersBlock}\n` : ''}Break this into individual source files, each under 200 lines.
Return ONLY a JSON array — no markdown, no explanation, no code:
[
  {"file": "src/models.py", "purpose": "Data models for expenses"},
  {"file": "src/storage.py", "purpose": "Save and load data from JSON file"},
  {"file": "src/main.py", "purpose": "CLI entry point"}
]`;

  const promptLen = Math.ceil(planPrompt.length / 4);
  // Normalise plan entries — AI may return {file} or {filename}, tolerate both
  interface PlanEntry { filename: string; purpose: string; }
  let filePlan: PlanEntry[] = [];

  try {
    const res = await routing.prompt(planPrompt, 30_000); // plan is tiny — 30s is fine
    if (!res.success) { throw new Error(res.error || 'Planning step failed'); }
    let raw = res.text.trim().replace(/^```[a-zA-Z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    if (arrMatch) { raw = arrMatch[0]; }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) { throw new Error('AI returned empty plan'); }
    // normalise {file} → {filename}
    filePlan = parsed.map((e: any) => ({ filename: e.filename || e.file || 'src/output.py', purpose: e.purpose || '' }));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    ctx.logError(task, planPrompt, `Build plan failed: ${errMsg}`, promptLen);
    conversation.pop();
    conversation.pop();
    appendMsg(ctx, `❌ Build plan failed\n\n**Reason:** ${errMsg}\n\n_Prompt was ~${promptLen} tokens. Full details in \`.chassis/build_errors.log\`_`);
    return;
  }

  updateLastMsg(ctx, `📋 Plan ready — ${filePlan.length} file${filePlan.length !== 1 ? 's' : ''} to build`);

  const builtFiles: string[] = [];
  for (let i = 0; i < filePlan.length; i++) {
    const entry = filePlan[i];
    const fileNum = i + 1;
    const total = filePlan.length;
    appendMsg(ctx, `⚙️ Building file ${fileNum} of ${total}: \`${entry.filename}\`...`);

    // Full file list gives the AI import context without including any code
    const allFiles = filePlan.map(f => `  - ${f.filename}: ${f.purpose}`).join('\n');
    const vaultSnippets = relevant.slice(0, 4).map(v => `# FROM VAULT: ${v.name}\n${v.code}`).join('\n\n');
    const filePrompt = `You are CHASSIS. Build one file as part of a larger project.

PROJECT TASK: "${task}"
${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}\n` : ''}${answersBlock ? `${answersBlock}\n` : ''}ALL FILES IN THIS PROJECT (for import awareness):
${allFiles}

FILE TO BUILD NOW: ${entry.filename}
PURPOSE: ${entry.purpose}
${relevant.length > 0 ? `VAULT ITEMS (reuse where relevant):\n${vaultSnippets}\n` : ''}RULES:
- Implement ONLY ${entry.filename} — do not output any other file
- Keep it under 200 lines
- Add a [SCOPE] comment at the top
- Write working, production-ready code with correct imports
- Return ONLY the code — no markdown fences, no explanation`;

    const filePromptLen = Math.ceil(filePrompt.length / 4);
    let code: string;
    let fileTokens = 0;
    let fileCost = 0;

    try {
      const res = await routing.prompt(filePrompt, 60_000); // 60s per file — code gen takes longer than planning
      if (!res.success) { throw new Error(res.error || 'AI generation failed'); }
      code = res.text.replace(/^```[a-zA-Z]*\n?/m, '').replace(/\n?```$/m, '').trim();
      if (!code) { throw new Error('AI returned an empty response'); }
      fileTokens = Math.ceil(res.text.length / 4);
      fileCost = (fileTokens / 1_000_000) * 0.30;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      ctx.logError(task, filePrompt, `File ${entry.filename}: ${errMsg}`, filePromptLen);
      conversation.pop();
      appendMsg(ctx,
        `❌ Failed on file ${fileNum} of ${total}: \`${entry.filename}\`\n\n**Reason:** ${errMsg}\n\n_Built ${builtFiles.length > 0 ? builtFiles.length + ' file(s) before this. ' : ''}Full details in \`.chassis/build_errors.log\`_`
      );
      return;
    }

    try {
      const absPath = path.join(root, entry.filename);
      const dir = path.dirname(absPath);
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
      fs.writeFileSync(absPath, code, 'utf8');
      builtFiles.push(entry.filename);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      ctx.logError(task, filePrompt, `Write failed for ${entry.filename}: ${errMsg}`, filePromptLen);
      conversation.pop();
      appendMsg(ctx, `❌ Could not write \`${entry.filename}\`\n\n**Reason:** ${errMsg}\n\n_Full details in \`.chassis/build_errors.log\`_`);
      return;
    }

    conversation.pop();
    const absPath = path.join(root, entry.filename);
    appendMsg(ctx, `✅ Built ${fileNum} of ${total}: \`${entry.filename}\`\n__BUILD_RESULT__${entry.filename}|||${absPath}|||END__`, fileTokens, fileCost);
  }

  appendMsg(ctx, `🏁 Done — built ${builtFiles.length} file${builtFiles.length !== 1 ? 's' : ''}:\n${builtFiles.map(f => `  • \`${f}\``).join('\n')}`);
}
