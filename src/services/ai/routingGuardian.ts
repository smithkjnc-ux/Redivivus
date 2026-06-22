// [SCOPE] AI Routing — supervisor planning and guardian review (cloud-backend path).
// Project type helpers extracted to routingGuardianUtils.ts (Rule 9 split).
// [WARN] Guardian sends keys as X-Provider-Keys header — never in body (avoid logging exposure).

import { callProvider } from '../../core/ai/providers/providerFactory.js';
import type { GuardianReviewResult } from './guardianAI.js';
import { selectGuardianAI, AI_RANK } from './guardianAI.js';
import { bestModelForRole } from './modelRegistry.js';
import type { RoutingService } from './routingService.js';
import { logAICall } from './aiCallLogger.js';
import { detectProjectType, getFolderStructureTemplate } from './routingGuardianUtils.js';
import { collectKeys } from '../api/apiClient.js';

export async function supervisorPlanImpl(
  svc: RoutingService,
  userTask: string,
  targetFile: string,
  blueprintContext: string,
  neverDoContext?: string
): Promise<string | null> {
  const { supervisor, worker } = svc.selectSupervisorAndWorker();
  if (!worker || worker === supervisor) { return null; }
  const fetch = (url: string, opts: RequestInit) => (svc as any).fetchWithTimeout(url, opts, 50_000);
  const neverDoSection = neverDoContext ? `\n${neverDoContext}\n` : '';
  const projectType = detectProjectType(userTask, blueprintContext || '');
  const folderBlock = (projectType && projectType !== 'single')
    ? `\n\n${getFolderStructureTemplate(projectType)}`
    : '';

  const supervisorPersona = `You are the shop foreman. You size the job before anyone picks up a wrench.

Your voice: direct, warm, efficient. You've seen every kind of job. You know in 5 seconds whether this is a 10-minute fix or a full day's work.

Rules for how you talk:
- For small jobs (tell-them tier): don't ask anything. Say what you're doing in one sentence and do it.
- For medium jobs (look-it-up, offer-choices): ask ONE question at a time. Most important unknown first.
- For big jobs (explore-with-them): make sure you're building the right thing before starting.
- No technical jargon with the user. "I'll update the function" not "I'll refactor the async handler."
- You have opinions. Share them. "I'd go with option 2 -- easier to change later. But it's your call."
- If the request doesn't match the goal, say so. "You asked for X -- sounds like you need Y. Want me to do Y?"

`;
  const prompt = `${supervisorPersona}You are the Redivivus Supervisor AI. Your prescription is the Worker's ONLY instruction set. The Worker executes exactly what you write -- nothing more, nothing less. If you are vague, the output will be wrong.${neverDoSection}

USER REQUEST: "${userTask}"
TARGET FILE: ${targetFile}
${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}\n` : ''}
PRESCRIPTION FORMAT:
## [filename]
- \`functionName(params)\` -- [complete behavior: exact logic, return value, every meaningful detail]
- \`CONSTANT_NAME = value\` -- explain why this specific value
- Change \`[exact old code]\` -> \`[exact new code]\`

UNIVERSAL PRECISION REQUIREMENT -- applies to every build, no exceptions:
The Worker has zero judgment. Every blank you leave becomes a wrong guess. Fill every blank.

VISUAL / CANVAS / GAME -- for every drawn element:
  - Exact shape: polygon(N irregular verts) / circle(r) / arc -- never just "shape" or "rock"
  - Fill: fillStyle='#rrggbb' or "no fill" | Stroke: strokeStyle='#rrggbb', lineWidth=N or "no stroke"
  - Polygon vertices: count, how calculated, where stored (e.g. "8 verts, random radius 0.8-1.2xbase, pre-calc on spawn into asteroid.verts[]")
  - Physics: px/frame speed, deg/frame rotation, wrap or bounce rule | Color palette: every color used

LOGIC / BACKEND / API -- for every function:
  - Exact signature, return type | All branches: what each case returns/throws
  - Data shape: exact field names and types | Constants: value + why that value

CSS / STYLING / UI -- for every element:
  - Exact colors (hex) and exact px/rem values -- not "dark blue" or "small margin"
  - Layout: flex/grid direction, gap, alignment | Breakpoints if any | Hover/focus states

STATE / DATA -- for every piece of state:
  - Name, type, initial value | Allowed mutations and when | Where it lives

RULE: If you cannot specify something exactly, choose the canonical default and state it explicitly.
Bad: "\`drawAsteroid(ctx, a)\` -- draws an asteroid"
Good: "\`drawAsteroid(ctx, a)\` -- ctx.beginPath(); a.verts.forEach((v,i)=> i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y)); ctx.closePath(); ctx.strokeStyle='#ffffff'; ctx.lineWidth=2; ctx.stroke(); // no fill"

Match EXACT scope of the request -- no extra features.${folderBlock ? ' Place each file in the correct subdirectory.' : ''}
Reply with ONLY the prescription. No preamble.${folderBlock}`;
  try {
    const startTime = Date.now();
    const res = await callProvider(supervisor, prompt, fetch, 'pro');
    if (res.success && res.text.trim().length > 50) {
      logAICall({ role: 'supervisor', model: res.model || supervisor, prompt, response: res.text, inputTokens: res.inputTokens, outputTokens: res.outputTokens, durationMs: Date.now() - startTime });
      let spec = res.text.trim();
      if (folderBlock && !spec.includes('FOLDER STRUCTURE')) { spec += '\n\n' + getFolderStructureTemplate(projectType!); }
      return spec;
    }
  } catch { /* fall through */ }
  return null;
}

export async function guardianReviewImpl(
  svc: RoutingService,
  originalTask: string,
  workerResponse: string,
  workerAI: string,
  blueprintContext: string,
  forceProvider?: string,
): Promise<GuardianReviewResult> {
  const keyMap = svc.getKeyMap();
  const preferred = forceProvider || selectGuardianAI(workerAI, keyMap);
  if (!preferred) {
    // [H3] No independent Guardian (a provider different from the Worker) is configured — fail CLOSED.
    // Previously returned passed:true, silently shipping unreviewed code. Surface a blocking verdict.
    return { passed: false, correctedText: null,
      issues: ['Guardian review unavailable: no second AI provider (different from the Worker) is configured. Add another provider to enable independent review — code was NOT reviewed.'],
      scopeAlerts: [], guardianAI: 'none', workerAI };
  }
  // [FIX][FAILOVER] Step the Guardian DOWN across configured AIs (preferred Guardian first, then the rest by
  // rank). If providers run out it degrades to whatever is left — even ONE AI doing Supervisor+Worker+Guardian
  // (Workshop principle 7). Only return "skipped/none" when EVERY provider failed. Previously the Guardian used
  // a single provider and silently skipped on any error (e.g. a capped Claude), shipping the fix unreviewed.
  // (PapaJoe: "they should all step down... could be one AI doing all three positions.")
  const ranked = Object.entries(AI_RANK)
    // [H2] Never fail over to the Worker's own provider — the Guardian must stay independent.
    .filter(([ai]: any) => ai !== workerAI && keyMap[ai]?.())
    .sort((a: any, b: any) => (b[1] as number) - (a[1] as number))
    .map(([ai]: any) => ai);
  // [ROUTING PANEL] A user-forced Guardian uses ONLY that provider (no failover, like the manual pill).
  const order = forceProvider ? [forceProvider] : [preferred, ...ranked.filter((p) => p !== preferred)];

  const fetchFn = (svc as any).fetchWithTimeout.bind(svc);
  const { getApiBase, getAccountToken } = require('../api/apiClient.js');
  const base = getApiBase();
  const token = await getAccountToken();
  // [FIX] Keys go in the X-Provider-Keys header, NOT the body (keyMap holds function refs -> JSON drops them).
  const keys = collectKeys();
  let gLastError = '';
  for (const guardianAI of order) {
    const startTime = Date.now();
    try {
      // [FIX] Send a REAL model ID, not the provider name. Was `model: guardianAI` (e.g. 'gemini') — the backend
      // passed that straight to the SDK, which rejected it as an unknown model, so the guardian failed on EVERY
      // provider and silently auto-approved (guardianAI:'none', passed:true) — shipping fixes unreviewed. The
      // Worker/Supervisor calls already resolve via bestModelForRole; the guardian must do the same. (Jun 13, 2026)
      const guardianModel = bestModelForRole(guardianAI, 'pro')?.modelId || guardianAI;
      const res = await fetchFn(`${base}/guardian`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Provider-Keys': JSON.stringify(keys) },
        body: JSON.stringify({ task: originalTask, workerResponse, blueprintContext, provider: guardianAI, model: guardianModel }),
      }, 50_000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { gLastError = (data && data.error) || `Guardian API ${res.status}`; continue; }
      const raw: string = data.text || '';
      if (!raw.trim()) { gLastError = 'empty guardian response'; continue; }
      const isPass = raw.includes('GUARDIAN_PASS');
      const issuesMatch = raw.match(/GUARDIAN_ISSUES:([\s\S]*?)(?:GUARDIAN_SCOPE_ALERTS:|$)/);
      const scopeMatch = raw.match(/GUARDIAN_SCOPE_ALERTS:([\s\S]*?)$/);
      let issues = issuesMatch ? issuesMatch[1].split('\n').map((l: string) => l.trim()).filter((l: string) => l.startsWith('-') || l.match(/^\[.*\]/)).map((l: string) => l.replace(/^[-\[\]\s]+/, '')) : [];
      // [FIX] Guardian returned GUARDIAN_FAIL with no GUARDIAN_ISSUES bullets — extract raw text as the
      // implicit critique so re-prescription has real context instead of 'Unknown issue'. Without this,
      // the critique is blank → re-prescription is blind → Worker repeats correct code → loop repeats.
      if (!isPass && issues.length === 0) {
        const rawCritique = raw.replace(/^GUARDIAN_FAIL\s*/i, '').replace(/GUARDIAN_ISSUES:[\s\S]*/g, '').replace(/GUARDIAN_SCOPE_ALERTS:[\s\S]*/g, '').trim();
        issues = rawCritique.length > 5 ? [rawCritique.slice(0, 400)] : ['Guardian rejected with no structured reason (possible format mismatch).'];
      }
      const scopeAlerts = scopeMatch ? scopeMatch[1].split('\n').map((l: string) => l.trim()).filter((l: string) => l.startsWith('-') || l.match(/^\[.*\]/)).map((l: string) => l.replace(/^[-\[\]\s]+/, '')) : [];
      const result = { passed: isPass && issues.length === 0, correctedText: null, issues, scopeAlerts, guardianAI, workerAI };
      logAICall({ role: 'guardian', model: guardianAI, prompt: `[Secure Backend Prompt] TASK: ${originalTask}`, response: JSON.stringify({ passed: result.passed, issues: result.issues, scopeAlerts: result.scopeAlerts }), durationMs: Date.now() - startTime });
      return result;
    } catch (e: any) { gLastError = e?.message || 'unknown'; continue; }
  }
  console.error('Guardian review failed on all providers:', gLastError);
  // [H3] Every Guardian provider failed — fail CLOSED. Previously returned passed:true, silently
  // shipping unreviewed code. Return a blocking verdict with the error so callers surface it.
  return { passed: false, correctedText: null,
    issues: [`Guardian review failed on all providers (${gLastError}) — code was NOT reviewed and must not ship as-is.`],
    scopeAlerts: [], guardianAI: 'none', workerAI };
}
