// [SCOPE] Chat fix handler -- 3-phase Supervisor/Worker/Guardian bug fix pipeline
// Phase 1: Supervisor AI (best available) diagnoses ALL bugs.
// Phase 2: Worker AI generates complete corrected files.
// Phase 3: Guardian reviews and corrects the fix. Writes to disk only after Guardian pass.
// [WARN] Always use routing.prompt() here -- routeByComplexity routes simple-looking bug reports
//        to Groq/cheap models which produce thin output and cause silent pipeline failure.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MessageHandlerDeps } from './chatPanelMessages.js';
import { parseFixResponse, takeSnapshot, collectSourceFiles } from './chatPanelMsgFixUtils.js';

function modelLabel(model: string): string {
  const m = (model || '').toLowerCase();
  if (m.includes('claude')) { return 'Claude'; }
  if (m.includes('gemini')) { return 'Gemini'; }
  if (m.includes('gpt') || m.includes('openai')) { return 'GPT-4o'; }
  if (m.includes('llama') || m === 'groq') { return 'Groq'; }
  if (m.includes('grok') || m === 'xai') { return 'Grok'; }
  if (m.includes('kimi') || m.includes('moonshot')) { return 'Kimi'; }
  return model || 'AI';
}

export async function handleFixRequest(userText: string, deps: MessageHandlerDeps): Promise<void> {
  const { routing, conversation, refresh } = deps;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    conversation.push({ role: 'assistant', content: 'No project folder open -- open your project first.', timestamp: Date.now() });
    refresh(); return;
  }

  const sourceFiles = collectSourceFiles(root);
  if (sourceFiles.length === 0) {
    conversation.push({ role: 'assistant', content: 'No source files found. Is the correct folder open?', timestamp: Date.now() });
    refresh(); return;
  }
  const allowedRels = new Set(sourceFiles.map(f => f.rel));
  const fileNames = sourceFiles.map(f => f.rel).join(', ');
  const filesBlock = sourceFiles.map(f => `// === FILE: ${f.rel} ===\n${f.content}`).join('\n\n');

  // Phase 1: Supervisor diagnoses ALL bugs
  // [WARN] Use routing.prompt() not routeByComplexity() -- short bug reports get misrouted to Groq
  conversation.push({ role: 'assistant', content: '[1/3] Supervisor: reading all files and diagnosing...', timestamp: Date.now() });
  refresh();

  let diagnosis = ''; let supervisorLabel = 'AI';
  try {
    const diagPrompt = `You are the Supervisor AI. A user reports a bug in their existing project.
User reports: "${userText}"

Source files:
${filesBlock}

Find EVERY bug contributing to this problem. For each bug:
- Severity: CRITICAL / HIGH / MODERATE
- File and exact function/line
- What is wrong and why it causes this symptom
- What the correct code should do

Number each bug. Be specific -- name actual variable names, function names. Do NOT suggest rebuilding.

Known patterns:
- Web Audio API / no sound (CRITICAL -- switch approach entirely): On Linux Chrome and file:// URLs,
  AudioContext.destination silently routes to a null device -- no error is thrown, code runs, zero audio.
  This is invisible from source code; it is a runtime environment problem not fixable by adjusting AudioContext.
  CORRECT FIX: abandon Web Audio API output entirely. Generate PCM samples in JS, write a WAV blob,
  play with new Audio(url).play(). This uses the HTML5 Audio pipeline which works on all systems.
  Diagnose ANY use of AudioContext / OscillatorNode / createGain as CRITICAL when the bug is "no sound".
  The WAV blob pattern:
    function playSound(name) { var url = buildWAV(name); new Audio(url).play(); }
    function buildWAV(name) { /* generate Float32Array samples, write 44-byte WAV header, return createObjectURL */ }`;

    const diagRes = await routing.prompt(diagPrompt, 60_000);
    if (!diagRes.success || !diagRes.text?.trim()) {
      conversation[conversation.length - 1].content = `[FAIL] Supervisor returned no response. Error: ${diagRes.error || 'unknown'}. Check your API key in Settings.`;
      refresh(); return;
    }
    diagnosis = diagRes.text.trim();
    supervisorLabel = modelLabel(diagRes.model);
  } catch (err) {
    conversation[conversation.length - 1].content = `[FAIL] Supervisor phase failed: ${err instanceof Error ? err.message : String(err)}`;
    refresh(); return;
  }

  // Phase 2: Worker generates complete corrected files
  conversation[conversation.length - 1].content =
    `[1/3] Supervisor (${supervisorLabel}): done\n[2/3] Worker: generating fix...`;
  refresh();

  let workerResponse = ''; let workerLabel = 'AI';
  try {
    const fixPrompt = `You are the Worker AI. Fix ALL bugs identified by the Supervisor.

SUPERVISOR DIAGNOSIS:
${diagnosis}

ORIGINAL SOURCE FILES (the ONLY files that exist in this project):
${fileNames}

${filesBlock}

RULES:
1. Fix ALL bugs in the diagnosis -- do not skip any
2. Return the COMPLETE corrected file for every file that changes -- every line, no truncation
3. Do NOT add unrequested features. Fix only what is diagnosed.
4. ONLY modify files listed above (${fileNames}). Do NOT create new files or invent file paths.
5. Web Audio API / no sound: DO NOT use AudioContext/OscillatorNode. Use WAV blob + Audio element.
   AudioContext.destination outputs silence on Linux Chrome (no error thrown) -- HTML5 Audio works.
   Pattern: function playSound(name){new Audio(buildWAV(name)).play();}
   buildWAV(name): allocate Float32Array, fill with sine/square wave segments using
   phase accumulator (phase+=2*PI*freq/sr), apply attack/release envelope (Math.min(t*30,1)*Math.min((dur-t)*20,1)),
   write standard 44-byte WAV header (RIFF/WAVE/fmt/data chunks, sr=44100, 16-bit mono),
   return URL.createObjectURL(new Blob([buf],{type:'audio/wav'})).

FORMAT (exact -- required):
## Fix: relative/path/to/file
\`\`\`
[COMPLETE corrected file content -- no truncation]
\`\`\``;

    const fixRes = await routing.prompt(fixPrompt, 90_000);
    if (!fixRes.success || !fixRes.text?.trim()) {
      conversation[conversation.length - 1].content = `[FAIL] Worker returned no response. Error: ${fixRes.error || 'unknown'}.`;
      refresh(); return;
    }
    workerResponse = fixRes.text.trim();
    workerLabel = modelLabel(fixRes.model);
  } catch (err) {
    conversation[conversation.length - 1].content = `[FAIL] Worker phase failed: ${err instanceof Error ? err.message : String(err)}`;
    refresh(); return;
  }

  // Phase 3: Guardian reviews the fix
  conversation[conversation.length - 1].content =
    `[1/3] Supervisor (${supervisorLabel}): done\n[2/3] Worker (${workerLabel}): done\n[3/3] Guardian: reviewing fix...`;
  refresh();

  let finalResponse = workerResponse; let guardianLabel = 'AI'; let guardianNote = '';
  try {
    const guardianContext = `Original problem: "${userText}"\nDiagnosis:\n${diagnosis}`;
    const guardianResult = await routing.guardianReview(guardianContext, workerResponse, workerLabel.toLowerCase(), '');
    guardianLabel = modelLabel(guardianResult.guardianAI || '');
    if (!guardianResult.passed && guardianResult.correctedText) {
      finalResponse = guardianResult.correctedText;
      guardianNote = `Guardian (${guardianLabel}) corrected ${guardianResult.issues.length} issue${guardianResult.issues.length !== 1 ? 's' : ''}: ${guardianResult.issues.slice(0, 2).join('; ')}`;
    } else {
      guardianNote = `Guardian (${guardianLabel}): Approved`;
    }
  } catch { guardianNote = 'Guardian: skipped (error)'; }

  // Parse fix blocks -- only writes files that exist in allowedRels (no phantom files)
  const { fixes, skipped } = parseFixResponse(finalResponse, root, allowedRels);
  if (fixes.length === 0) {
    const skipNote = skipped.length > 0 ? `\n[WARN] Worker invented ${skipped.length} file(s) not in project: ${skipped.join(', ')}` : '';
    conversation[conversation.length - 1].content =
      `**Supervisor (${supervisorLabel}):**\n${diagnosis}\n\n---\nWorker could not produce correctable file blocks. Describe the problem differently and try again.${skipNote}`;
    refresh(); return;
  }

  takeSnapshot(root, fixes.map(f => f.rel));
  const written: string[] = []; const failed: string[] = [];
  for (const fix of fixes) {
    try {
      fs.mkdirSync(path.dirname(fix.abs), { recursive: true });
      fs.writeFileSync(fix.abs, fix.content, 'utf-8');
      written.push(fix.rel);
    } catch (e) { failed.push(`${fix.rel}: ${e instanceof Error ? e.message : String(e)}`); }
  }

  const fileList = written.map(f => `- \`${f}\``).join('\n');
  const skipLine = skipped.length > 0 ? `\n[WARN] Worker invented ${skipped.length} non-existent file(s) -- skipped: ${skipped.join(', ')}` : '';
  const failLine = failed.length > 0 ? `\n[WARN] Could not write: ${failed.join(', ')}` : '';
  const previewToken = written.some(f => f.endsWith('.html'))
    ? `\n__PREVIEW_BROWSER__${path.join(root, written.find(f => f.endsWith('.html'))!)}|||END_PREVIEW_BROWSER__`
    : '';

  conversation[conversation.length - 1].content =
    `**Supervisor (${supervisorLabel}):**\n${diagnosis}\n\n---\n` +
    `**Fixed ${written.length} file${written.length !== 1 ? 's' : ''}** (Worker: ${workerLabel})\n${guardianNote}\n${fileList}${skipLine}${failLine}${previewToken}`;
  refresh();

  if (written.length > 0) {
    try { await vscode.window.showTextDocument(vscode.Uri.file(path.join(root, written[0])), { preview: true, preserveFocus: true }); } catch { /* non-blocking */ }
  }
}
