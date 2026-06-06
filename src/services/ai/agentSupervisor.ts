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

    // [WARN] Must use 'pro' tier here -- default tier maps to Haiku which produces shallow prescriptions.
    // Supervisor needs Sonnet/Pro to write specific pixel-art bitmaps and multi-type sprite patterns.
    const fetchFn = (routing as any).fetchWithTimeout;
    const base = require('../api/apiClient.js').getApiBase();
    const token = await require('../api/apiClient.js').getAccountToken();
    const keysPayload = require('../api/apiClient.js').collectKeys();
    const { bestModelForRole } = require('./modelRegistry.js');
    const actualModel = bestModelForRole(supervisor, 'pro')?.modelId || supervisor;
    
    const apiRes = await fetchFn(`${base}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        provider: supervisor,
        model: actualModel,
        keys: keysPayload,
        promptType: 'agent-supervisor',
        prompt: `USER REQUEST: "${task}"\n\nPROJECT CONTEXT:\n${context}\n${fileSection}`,
        maxTokens: 4000,
        temperature: 0.1
      })
    }, 50_000);

    const data = await apiRes.json();
    if (!apiRes.ok) throw new Error(data.error || 'Agent supervisor API failed');

    if (data.text && data.text.trim().length > 50) {
      const usedModel = friendlyModelName(supervisor);
      logAICall({ role: 'supervisor', model: supervisor, prompt: '[Secure Backend Prompt] TASK: ' + task, response: data.text, inputTokens: data.inputTokens, outputTokens: data.outputTokens });
      onUpdate(`📋 **Prescription ready** (${usedModel}) — handing off to implementation agent...`);
      return `\nSUPERVISOR PRESCRIPTION -- implement this EXACTLY, do not ask questions, do not deviate:\n${data.text.trim()}\n`;
    }
  } catch (e) { console.error('Agent supervisor preplanning failed:', e); }
  return '';
}
