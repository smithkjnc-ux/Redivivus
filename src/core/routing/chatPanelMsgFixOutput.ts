// [SCOPE] Fix pipeline output — plain-language result card for non-coders
// Extracted from chatPanelMsgFix.ts. Builds the final conversation message after files are written.

import * as fs from 'fs';
import * as path from 'path';
import type { MessageHandlerDeps } from './chatPanelMessages';
import { appendProjectDeadEnd, writeProjectRoadmapEntry } from './chatPanelMsgFixUtils';
import { validateOutputFiles } from './chatPanelMsgFixPatterns';
import { BuildHistoryService, makeBuildHistoryEntry } from '../../services/build/buildHistoryService';
import { fixLog } from '../../services/logging/fixPipelineLogger';

function extractPlain(diagnosis: string): string {
  return diagnosis.match(/^PLAIN:\s*(.+?)(?:\n|$)/m)?.[1]?.trim() ?? '';
}

function technicalOnly(diagnosis: string): string {
  return diagnosis.replace(/^PLAIN:.*\n?/m, '').trim();
}

export async function presentFixResult(params: {
  written: string[]; failed: string[]; skipped: string[]; fixSnapId: string | undefined;
  diagnosis: string; supervisorLabel: string; workerLabel: string; guardianLabel: string;
  scopeNote: string; userText: string; root: string; deps: MessageHandlerDeps; activePatterns: any[];
}): Promise<void> {
  const { written, failed, skipped, fixSnapId, diagnosis, supervisorLabel, workerLabel, guardianLabel, scopeNote, userText, root, deps, activePatterns } = params;
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

  conversation[conversation.length - 1].content =
    (plainSummary ? `**What I found:** ${plainSummary}\n\n` : '') +
    `**What I changed:**\n${fileList}` +
    `${skipLine}${failLine}${configWarn}${instrWarn}${validWarn}${scopeNote}${previewToken}${techBlock}${commitToken}`;
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
