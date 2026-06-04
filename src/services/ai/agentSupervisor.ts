// [SCOPE] Agent supervisor pre-planning -- reads current project files THEN generates a prescription.
// Called before the agent loop starts. Supervisor sees actual code before writing the work order,
// not just the task description. Split from agentService.ts (Rule 9).

import * as fs from 'fs';
import * as path from 'path';
import { callProvider } from '../../core/ai/providers/providerFactory.js';
import type { RoutingService } from './routingService.js';
import type { AgentContext } from './agentTools.js';
import { logAICall } from './aiCallLogger.js';
import { friendlyModelName } from './agentNarrator.js';

const SOURCE_EXTS = ['.html', '.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java', '.rb', '.css'];
const MAX_FILE_BYTES = 60_000;
const MAX_FILES = 4;

/** Read the main source files from the project root so the supervisor sees actual code. */
function readProjectFiles(root: string): string {
  let out = '';
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const sourceFiles = entries
      .filter(e => e.isFile() && SOURCE_EXTS.some(ext => e.name.endsWith(ext)))
      .slice(0, MAX_FILES);
    for (const entry of sourceFiles) {
      const abs = path.join(root, entry.name);
      const stat = fs.statSync(abs);
      if (stat.size > MAX_FILE_BYTES) { continue; }
      const content = fs.readFileSync(abs, 'utf8');
      out += `\n--- CURRENT FILE: ${entry.name} (${content.split('\n').length} lines) ---\n${content}\n`;
    }
  } catch { /* best-effort */ }
  return out;
}

/**
 * Run supervisor planning before the agent loop.
 * 1. Read current project files so the supervisor sees actual code.
 * 2. Call supervisor with a prescription-only prompt -- NEVER asks questions, makes all decisions.
 * 3. Return the prescription string, or '' if supervisor unavailable.
 *
 * [WARN] Do NOT use routing.supervisorPlan() here -- that uses the "shop foreman" persona which
 * asks one question for medium/large jobs. In agent pre-planning there is nobody to answer.
 * We use routing.prompt() directly with a prescription-only system prompt instead.
 */
export async function runSupervisorPreplanning(
  task: string,
  context: string,
  agentCtx: AgentContext,
  routing: RoutingService,
  onUpdate: (msg: string) => void
): Promise<string> {
  onUpdate('🔍 **Supervisor** reading current project files...');
  const fileContent = readProjectFiles(agentCtx.root);

  const { supervisor, worker } = routing.selectSupervisorAndWorker();
  const supervisorLabel = friendlyModelName(supervisor);
  onUpdate(`🎯 **Supervisor** (${supervisorLabel}) analyzing task and generating prescription...`);
  try {
    // Only run supervisor if there is a distinct, higher-capability supervisor -- otherwise no value
    if (!worker || worker === supervisor) { return ''; }

    const fileSection = fileContent
      ? `\nCURRENT PROJECT FILES (read these before prescribing):\n${fileContent}`
      : '';

    // [WARN] NEVER ask questions in this prompt. The worker loop has no way to pause for answers.
    const prescriptionPrompt = `You are the Redivivus Supervisor AI writing a work order for an implementation agent.

RULES -- non-negotiable:
1. NEVER ask the user or agent any questions. Make ALL decisions yourself based on the code you can see.
2. Match the existing file structure exactly -- if it is a single file, keep it single file. If multi-file, stay multi-file.
3. Write a SPECIFIC prescription: exact file paths, exact function names, exact code snippets for key changes.
4. For visual/canvas changes: provide the actual pixel bitmap arrays or drawing code, not vague descriptions.
5. Be precise enough that an implementer needs ZERO judgment calls.

USER REQUEST: "${task}"

PROJECT CONTEXT:
${context}
${fileSection}

Write the prescription now. No preamble. No questions. Start directly with the file and changes.`;

    // [WARN] Must use 'pro' tier here -- default tier maps to Haiku which produces shallow prescriptions.
    // Supervisor needs Sonnet/Pro to write specific pixel-art bitmaps and multi-type sprite patterns.
    const fetchFn = (url: string, opts: RequestInit) => (routing as any).fetchWithTimeout(url, opts, 30_000);
    const res = await callProvider(supervisor, prescriptionPrompt, fetchFn, 'pro');
    if (res.success && res.text && res.text.trim().length > 50) {
      const usedModel = friendlyModelName(res.model || supervisor);
      logAICall({ role: 'supervisor', model: res.model || supervisor, prompt: prescriptionPrompt, response: res.text, inputTokens: res.inputTokens, outputTokens: res.outputTokens });
      onUpdate(`📋 **Prescription ready** (${usedModel}) — handing off to implementation agent...`);
      return `\nSUPERVISOR PRESCRIPTION -- implement this EXACTLY, do not ask questions, do not deviate:\n${res.text.trim()}\n`;
    }
  } catch { /* non-blocking */ }
  return '';
}
