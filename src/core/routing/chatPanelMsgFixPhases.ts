// [SCOPE] Phase 1 (Supervisor) and Phase 2 (Worker) LLM invocations for the fix pipeline.

import * as fs from 'fs';
import * as path from 'path';
import type { MessageHandlerDeps } from './chatPanelMessages';
import { modelLabel } from './chatPanelMsgFixUtils';
import { buildSupervisorNotes, buildWorkerRules } from './chatPanelMsgFixPatterns';
import { Redivivus_WORKER_RULES } from '../../services/ai/redivivusWorkerRules';
import { streamProvider } from '../../services/ai/streamingProviders';

export async function runPhase1Supervisor(
  userText: string,
  filesBlock: string,
  buildContext: string,
  activePatterns: any[],
  projectDeadEnds: string,
  projectRules: string,
  deps: MessageHandlerDeps,
  root: string,
  imageBase64?: string,
  imageType?: string,
  isRetry = false
): Promise<{ diagnosis: string, supervisorLabel: string, expandedFilesBlock: string } | null> {
  const supervisorSystem = `You are the Supervisor AI in the Redivivus code editing system. Your role is to analyze the user's request and identify exactly what changes are needed in the existing code.

BEHAVIORAL RULES:
- Handle BOTH bug reports AND feature/change requests (add X, change Y, update Z). Identify ONLY the specific changes needed for this exact request.
- Be specific: name actual variable names, function names, and exact lines.
- Do NOT suggest unnecessary refactoring or restructuring. BUT: if the current approach is fundamentally broken (e.g., relies on missing files, uses wrong APIs, has architectural issues that prevent the feature from working), explicitly recommend the correct approach and what needs to change.
- Read [SCOPE] and [ANNOTATION] comments in source files FIRST -- they explain what each section does.
- For bugs: state Severity (CRITICAL/HIGH/MODERATE), File + function/line, What is wrong, What the correct fix is.
- For features/changes: state which files to modify, what to add or change, and the exact implementation details.
- Number each required change.
CRITICAL: Do NOT write "Solution:", "Verification Completed:", or anything implying the fix was already applied. You are DIAGNOSING. The Worker implements AFTER you.
REQUIRED FORMAT: Start with: PLAIN: [one plain-English sentence — what is wrong and what changes. No jargon.]
Then your full technical analysis. End with a PRESCRIPTION section (mandatory — Worker reads this directly instead of inferring):
PRESCRIPTION:
## filename
- [label]: change \`[exact old code]\` → \`[exact new code]\`
- [label]: add \`[new code]\` [where — e.g. "inside body{} CSS rule", "after function X"]
Quote exact code. One line per surgical change. Worker will apply PRESCRIPTION verbatim.${buildSupervisorNotes(activePatterns)}
TRIVIAL FIXES: If the fix is extremely simple (e.g. changing < 10 lines in a single file, fixing a typo, updating a CSS color), append exactly "[TRIVIAL: SKIP REVIEW]" at the very end of your response to bypass the Guardian pipeline.
CONTEXT EXPANSION: If you need files not in sources, append: NEEDS_FILES:\nrelative/path.ts (max 8, omit section if sufficient).`;

  // Blueprint context (who/what/where/when/why) — tells Supervisor what the project is
  const _cfg = deps.redivivus?.loadConfig?.();
  const _bp = _cfg?.blueprint;
  const _bpBlock = _bp
    ? `PROJECT BLUEPRINT:\n- What: ${_bp.what}\n- Who: ${_bp.who}\n- Platform/Where: ${_bp.where}\n- Timeline: ${_bp.when}\n- Goal: ${_bp.why}\n\n`
    : '';

  // Recent roadmap entries — tells Supervisor what changed recently
  let _roadmapBlock = '';
  try { const _rp = path.join(root, 'REDIVIVUS_ROADMAP.md'); if (fs.existsSync(_rp)) { const _recent = fs.readFileSync(_rp, 'utf-8').slice(-700).trim(); if (_recent) { _roadmapBlock = `RECENT PROJECT CHANGES:\n${_recent}\n\n`; } } } catch {}

  // File skeleton — architecture overview from [SCOPE] annotations without full file content
  const _skelLines: string[] = [];
  for (const blk of filesBlock.split(/\n\/\/ === FILE: /).slice(1)) {
    const nl = blk.indexOf('\n'); if (nl === -1) { continue; }
    const rel = blk.slice(0, nl).replace(/\s*===\s*$/, '').trim();
    const scopeLine = blk.slice(nl + 1).split('\n').slice(0, 4).find(l => /\[SCOPE\]|\[NARRATOR\]/.test(l));
    if (scopeLine) { _skelLines.push(`  ${rel}: ${scopeLine.replace(/\/\/\s*\[(?:SCOPE|NARRATOR)\]\s*/i, '').trim()}`); }
  }
  const _skelBlock = _skelLines.length > 0 ? `FILE ARCHITECTURE (role of each file):\n${_skelLines.join('\n')}\n\n` : '';

  const diagPrompt = `${_bpBlock}${_roadmapBlock}${_skelBlock}${buildContext ? buildContext + '\n\n' : ''}User reports: "${userText}"

Source files:
${filesBlock}${projectDeadEnds ? `\n\nPREVIOUSLY FAILED APPROACHES (DO NOT suggest these again):\n${projectDeadEnds}` : ''}${projectRules ? `\n\nPROJECT RULES (your fix must not violate these):\n${projectRules}` : ''}`;

  const diagRes = await deps.routing.prompt(diagPrompt, 60_000, imageBase64, imageType, supervisorSystem);
  if (!diagRes.success || !diagRes.text?.trim()) {
    throw new Error(`Supervisor returned no response. Error: ${diagRes.error || 'unknown'}. Check your API key in Settings.`);
  }
  let diagnosis = diagRes.text.trim();
  const supervisorLabel = modelLabel(diagRes.model);
  deps.usageTracker?.recordUsage(Math.ceil((diagPrompt.length+diagnosis.length)/4), 0, diagRes.model||'claude', diagRes.inputTokens, diagRes.outputTokens, 'supervisor', require('path').basename(root));
  if (!isRetry) { // Expand context if Supervisor identified missing files (one round-trip only)
    const reqd = (diagnosis.match(/NEEDS_FILES:\n([\s\S]*?)(?=\n\n|$)/)?.[1] || '').trim().split('\n').map(l => l.trim()).filter(l => l && !l.includes('..') && !l.startsWith('/'));
    const extra = reqd.slice(0, 8).flatMap(rel => { try { return [{ rel, content: fs.readFileSync(path.join(root, rel), 'utf-8') }]; } catch { return []; } });
    if (extra.length > 0) {
      const expanded = filesBlock + '\n\n' + extra.map(f => `// === FILE: ${f.rel} ===\n${f.content}`).join('\n\n');
      return runPhase1Supervisor(userText, expanded, buildContext, activePatterns, projectDeadEnds, projectRules, deps, root, imageBase64, imageType, true);
    }
  }
  diagnosis = diagnosis.replace(/\nNEEDS_FILES:\n[\s\S]*$/, '').trim();
  return { diagnosis, supervisorLabel, expandedFilesBlock: filesBlock };
}

export async function runPhase2Worker(
  diagnosis: string,
  fileNames: string,
  filesBlock: string,
  activePatterns: any[],
  deps: MessageHandlerDeps,
  root: string,
  onChunk?: (chunk: string) => void
): Promise<{ workerResponse: string, workerLabel: string } | null> {
  const workerSystem = `You are the Worker AI in the Redivivus code editing system. You make precise, surgical code changes.

IDENTITY AND DISCIPLINE:
- The Supervisor's analysis ends with a PRESCRIPTION section — implement each listed change exactly. Nothing beyond what PRESCRIPTION specifies.
- You make surgical edits -- modify ONLY the exact lines that need to change.
- You NEVER refactor, rename variables, reformat code, or "improve" anything beyond the requested change.
- You NEVER create new files or invent file paths that the Supervisor did not identify.
- You read [SCOPE] and [ANNOTATION] comments to understand code structure before changing anything.
- For every block of code you REMOVE or REPLACE, add a [DEAD] comment above it.
${deps.assistMode ? '' : Redivivus_WORKER_RULES + '\n'}${buildWorkerRules(activePatterns, 9)}
OUTPUT FORMAT — choose based on scope:

SURGICAL (targeted change ≤ ~30% of file):
<file path="relative/path/to/file">
  <edit>
    <search>
[exact existing code — copy verbatim, include 2-3 context lines]
    </search>
    <replace>
[replacement code]
    </replace>
  </edit>
</file>

UNIFIED DIFF: standard git diff format (--- a/path  +++ b/path  @@ hunks) — use when exact text match would be fragile.

FULL FILE (structural rewrite or >30% of file changed):
<file path="relative/path/to/file">
  <content>
[complete new file content]
  </content>
</file>
IMPORTANT: For any .html file, ALWAYS use FULL FILE format with <content> tags — never surgical edits. HTML files with inline JS are too large for reliable text matching.
Output ONLY these blocks. No prose, no explanations.`;

  const fixPrompt = `SUPERVISOR ANALYSIS:
${diagnosis}

PROJECT SOURCE FILES:
${fileNames}

${filesBlock}`;

  const workerAI = deps.routing.selectSupervisorAndWorker().worker || deps.routing.getAvailableAI().ai;

  if (onChunk) {
    try {
      const streamRes = await streamProvider(workerAI, fixPrompt, onChunk, 120_000, workerSystem);
      if (streamRes.success && streamRes.text) {
        deps.usageTracker?.recordUsage(Math.ceil((fixPrompt.length+streamRes.text.length)/4), 0, streamRes.model||'claude', streamRes.inputTokens, streamRes.outputTokens, 'worker', require('path').basename(root));
        return { workerResponse: streamRes.text.trim(), workerLabel: modelLabel(streamRes.model) };
      }
    } catch { /* fallback to non-streaming */ }
  }

  const fixRes = await deps.routing.prompt(fixPrompt, 90_000, undefined, undefined, workerSystem);
  if (!fixRes.success || !fixRes.text?.trim()) {
    throw new Error(`Worker returned no response. Error: ${fixRes.error || 'unknown'}.`);
  }
  const workerResponse = fixRes.text.trim();
  const workerLabel = modelLabel(fixRes.model);
  deps.usageTracker?.recordUsage(Math.ceil((fixPrompt.length+workerResponse.length)/4), 0, fixRes.model||'claude', fixRes.inputTokens, fixRes.outputTokens, 'worker', require('path').basename(root));
  return { workerResponse, workerLabel };
}

