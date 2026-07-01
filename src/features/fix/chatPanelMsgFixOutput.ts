// [SCOPE] Fix pipeline output — plain-language result card for non-coders
// Extracted from chatPanelMsgFix.ts. Builds the final conversation message after files are written.

import * as fs from 'fs';
import * as path from 'path';
import type { MessageHandlerDeps } from '../chat/logic/chatPanelMessages.js';
import { appendProjectDeadEnd } from './chatPanelMsgFixDeadEnds.js';
import { parseFixResponse, takeSnapshot, writeProjectRoadmapEntry } from './chatPanelMsgFixUtils.js';
import { validateOutputFiles } from './chatPanelMsgFixPatterns.js';
import { BuildHistoryService, makeBuildHistoryEntry } from '../build/services/buildHistoryService.js';
import { recordFix, learnFromFile } from '../chat/logic/userMemoryService.js';
import { fixLog } from '../../features/logging/data/fixPipelineLogger.js';
import { modelLabel } from './chatPanelMsgFixUtils.js';

function extractPlain(diagnosis: string): string {
  return diagnosis.match(/^PLAIN:\s*(.+?)(?:\n|$)/m)?.[1]?.trim() ?? '';
}

function technicalOnly(diagnosis: string): string {
  return diagnosis.replace(/^PLAIN:.*\n?/m, '').trim();
}

function buildConfidenceBadge(guardianNote: string, retryCount: number, escalated: boolean): string {
  const n = (guardianNote || '').toLowerCase();
  if (/error|skipped \(error/.test(n)) {
    return `🔴 **Confidence: Unverified** — Guardian encountered an error, fix was not reviewed\n\n`;
  }
  if (/no reviewer available/.test(n)) {
    return `🟠 **Confidence: Unreviewed** — only one AI key configured, no independent review ran\n\n`;
  }
  if (escalated) {
    return `🟠 **Confidence: Low — verify manually** — fix only passed after escalating to a stronger model\n\n`;
  }
  if (retryCount >= 2) {
    return `🟡 **Confidence: Medium** — Guardian approved after ${retryCount} retries\n\n`;
  }
  if (retryCount === 1) {
    return `🟡 **Confidence: Medium** — Guardian approved after 1 retry\n\n`;
  }
  if (/trivial/.test(n)) {
    return `🟢 **Confidence: High** — trivial change, skipped review\n\n`;
  }
  if (/approved/.test(n)) {
    return `🟢 **Confidence: High** — Guardian approved on first attempt\n\n`;
  }
  return '';
}

export async function presentFixResult(params: {
  written: string[]; failed: string[]; skipped: string[]; fixSnapId: string | undefined;
  diagnosis: string; supervisorLabel: string; workerLabel: string; guardianLabel: string;
  scopeNote: string; userText: string; root: string; deps: MessageHandlerDeps; activePatterns: any[];
  guardianNote?: string; retryCount?: number; escalated?: boolean;
}): Promise<void> {
  const { written, failed, skipped, fixSnapId, diagnosis, supervisorLabel, workerLabel, guardianLabel, scopeNote, userText, root, deps, activePatterns, guardianNote = '', retryCount = 0, escalated = false } = params;
  const { conversation, refresh } = deps;

  const plainSummary = extractPlain(diagnosis);
  const technical = technicalOnly(diagnosis);

  // Config-only detection
  const configFiles = ['package.json', 'package-lock.json', 'tsconfig.json', '.gitignore', 'README.md'];
  const onlyConfigModified = written.length > 0 && written.every(f => configFiles.includes(f.toLowerCase()) || f.endsWith('.config.js') || f.endsWith('.config.ts'));
  if (onlyConfigModified) { fixLog('VALIDATION: Only config files modified - fix likely failed'); }

  // Instruction-only detection
  const writtenFixes = written.map(rel => ({ rel, content: fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), 'utf-8') : '' }));
  const instrPat = /^(1\.|\* |- |Step \d|Open the|Press |Click |Watch |To test|To verify)/m;
  const containsOnlyInstructions = writtenFixes.length > 0 && writtenFixes.every(f => {
    const code = f.content.split('\n').filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('/*') && !l.trim().startsWith('*'));
    return code.filter(l => instrPat.test(l)).length > 2 || f.content.includes('1. Open the game') || f.content.includes('2. Press');
  });
  if (containsOnlyInstructions) { fixLog('VALIDATION: Instructions-only content detected - fix failed'); }

  // Pattern validation
  fixLog('VALIDATION: Running pattern validation...', { fileCount: written.length });
  const patternViolations = validateOutputFiles(writtenFixes, userText);
  fixLog('VALIDATION: Pattern violations found', { count: patternViolations.length });

  // Write dead-end entries for resolved patterns
  if (patternViolations.length === 0) {
    for (const p of activePatterns) { appendProjectDeadEnd(root, p.name, p.triedWhat, p.whyFails, p.doInstead); }
  }

  // Roadmap + history
  if (written.length > 0 && !deps.assistMode) {
    writeProjectRoadmapEntry(root, `AI fix: ${userText.slice(0, 60)}`, written.map(f => `Fixed \`${f}\``).concat([`Supervisor: ${supervisorLabel} Worker: ${workerLabel} Guardian: ${guardianLabel}`]));
    try { new BuildHistoryService(root).record(makeBuildHistoryEntry({ snapshotId: fixSnapId || `fix-${Date.now()}`, task: `[FIX] ${userText.slice(0, 80)}`, files: written, tokensUsed: 0, costUSD: 0, source: 'ai', supervisor: supervisorLabel, worker: workerLabel !== 'AI' ? workerLabel : null, resultCardToken: '' })); } catch {}
    try { recordFix(); } catch {}
    // Learn style from written files — capped at 5, non-blocking, zero AI tokens
    written.slice(0, 5).forEach(rel => {
      try {
        const abs = path.join(root, rel);
        const content = fs.readFileSync(abs, 'utf-8');
        learnFromFile(abs, content);
      } catch { /* never surface learning errors */ }
    });
  }

  // Plain-language output
  const fileList = written.map(f => `• \`${f}\``).join('\n');
  const previewFile = written.find(f => f.endsWith('.html'));
  const previewToken = previewFile ? `\n__PREVIEW_BROWSER__${path.join(root, previewFile)}|||END_PREVIEW_BROWSER__` : '';
  const skipLine = skipped.length > 0 ? `\n\n⚠️ Skipped ${skipped.length} file(s) the AI invented that aren't in this project: ${skipped.join(', ')}` : '';
  const failLine = failed.length > 0 ? `\n\n⚠️ Couldn't write: ${failed.join(', ')}` : '';
  const configWarn = onlyConfigModified ? `\n\n⚠️ Only config files were changed, not actual code — describe which feature or file to fix more specifically.` : '';
  const instrWarn = containsOnlyInstructions ? `\n\n⚠️ The AI wrote instructions instead of code — try asking: "write the code that does X" rather than "add X."` : '';
  const validWarn = patternViolations.length > 0 ? `\n\n⚠️ This pattern persisted after an automatic retry — try describing the fix more specifically.` : '';
  const techBlock = technical ? `\n\n__TECH_DETAILS__${technical}__END_TECH__` : '';
  const commitPayload = written.length > 0 ? Buffer.from(JSON.stringify({ files: written, message: plainSummary || `fix: ${userText.slice(0, 80)}` })).toString('base64') : '';
  const commitToken = commitPayload ? `\n__GITHUB_COMMIT__${commitPayload}|||END_GITHUB_COMMIT__` : '';

  // [FIX] Derive pipeline line AND usage breakdown from the usage tracker — single source of truth.
  // The old snapshot labels (supervisorLabel/workerLabel/guardianLabel) only capture the final provider
  // for each role and miss re-prescriptions, multiple Worker attempts, and Compliance Verifier runs.
  let aiLabels = `\n\n*Pipeline: Supervisor (${supervisorLabel}) → Worker (${workerLabel}) → Guardian (${guardianLabel})*`;

  if (deps.usageTracker) {
    try {
      const report = deps.usageTracker.getReport(path.basename(root));
      if (report && report.session && report.session.byAI) {
        const ROLE_ORDER: Record<string, number> = { supervisor: 0, worker: 1, guardian: 2, qa: 3, solo: 4 };
        const ROLE_LABEL: Record<string, string> = { supervisor: 'Supervisor', worker: 'Worker', guardian: 'Guardian', qa: 'QA', solo: 'Solo' };
        const entries: { role: string; display: string; tokens: number; cost: number }[] = [];
        for (const ai of report.session.byAI) {
          const display = modelLabel(ai.aiProvider);
          for (const r of (ai.byRole || [])) {
            entries.push({ role: r.role, display, tokens: r.tokens, cost: r.cost });
          }
          if (!(ai.byRole || []).length) {
            entries.push({ role: 'solo', display, tokens: ai.tokens, cost: ai.cost });
          }
        }
        entries.sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));

        // Rebuild pipeline line from usage data — shows ALL providers that participated in each role,
        // not just the last snapshot value. E.g. "Worker (Claude/GPT-4o)" if both ran.
        const roleProviders: Record<string, string[]> = { supervisor: [], worker: [], guardian: [] };
        for (const e of entries) {
          if (roleProviders[e.role] !== undefined && !roleProviders[e.role].includes(e.display)) {
            roleProviders[e.role].push(e.display);
          }
        }
        const supLine  = roleProviders.supervisor.join('/') || supervisorLabel;
        const wkLine   = roleProviders.worker.join('/')    || workerLabel;
        const gdLine   = roleProviders.guardian.join('/')  || guardianLabel;
        aiLabels = `\n\n*Pipeline: Supervisor (${supLine}) → Worker (${wkLine}) → Guardian (${gdLine})*`;

        const aiStats = entries.map(e =>
          `- ${ROLE_LABEL[e.role] || e.role} (${e.display}): ${e.tokens.toLocaleString()} tokens ($${e.cost.toFixed(4)})`
        ).join('\n');
        aiLabels += `\n\n**Usage:**\n${aiStats}\n**Total:** $${report.session.cost.toFixed(4)}`;
      }
    } catch {
      // Ignore if usage tracker fails — pipeline line falls back to snapshot labels above
    }
  }
  
  const confidenceBadge = buildConfidenceBadge(guardianNote, retryCount, escalated);
  conversation[conversation.length - 1].content =
    confidenceBadge +
    (plainSummary ? `**What I found:** ${plainSummary}\n\n` : '') +
    `**What I changed:**\n${fileList}` +
    `${skipLine}${failLine}${configWarn}${instrWarn}${validWarn}${scopeNote}${previewToken}${aiLabels}${techBlock}${commitToken}`;
  refresh(); deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
  // Auto-open/refresh preview after fix if web files were changed and server is running
  const webExts = ['.html', '.css', '.js', '.ts', '.svg'];
  if (written.some(f => webExts.some(ext => f.endsWith(ext)))) {
    deps.panel.webview.postMessage({ type: 'preview-show-refresh' });
  }
  if (written.length > 0 && fixSnapId) {
    deps.panel.webview.postMessage({ type: 'preview-fix-applied', snapId: fixSnapId, files: written });
  }
}
