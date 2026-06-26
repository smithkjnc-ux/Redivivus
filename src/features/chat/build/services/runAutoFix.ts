// [SCOPE] Run Auto-Fix — runs the built project, detects runtime crashes, asks AI to fix, re-runs.
// Called after compile/test auto-fix. Up to 2 retries. Never throws.
import * as fs from 'fs';
import * as path from 'path';
import type { BuildContext } from '../chatPanelBuildHelpers.js';
import { appendMsg, updateLastMsg } from '../chatPanelBuildHelpers.js';
import { runProject, detectRunCommand, needsNodeInstall, installNodeDeps } from './runtimeRunner.js';

const MAX_RETRIES = 2;

const FILE_LINE_RE = /([a-zA-Z0-9_./-]+\.[a-z]{1,4}):\d+/g;

function parseErrorFiles(output: string, root: string, builtFiles: string[]): string[] {
  const found = new Set<string>();
  const re = new RegExp(FILE_LINE_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(output)) !== null) {
    const abs = path.isAbsolute(m[1]) ? m[1] : path.join(root, m[1]);
    const rel = path.relative(root, abs);
    if (!rel.startsWith('..') && !rel.includes('node_modules') && fs.existsSync(abs)) { found.add(rel); }
  }
  return found.size > 0 ? Array.from(found).slice(0, 3) : builtFiles.slice(0, 3);
}

async function aiFixRuntimeError(ctx: BuildContext, output: string, builtFiles: string[]): Promise<boolean> {
  const targets = parseErrorFiles(output, ctx.root, builtFiles);
  let fixed = false;
  for (const relPath of targets) {
    const absPath = path.join(ctx.root, relPath);
    let src: string;
    try { src = fs.readFileSync(absPath, 'utf8'); } catch { continue; }
    const prompt =
      `Fix the runtime error below. Return ONLY the corrected source -- no fences, no explanation.\n\n` +
      `FILE: ${relPath}\n\nRUNTIME ERROR:\n${output.slice(0, 2000)}\n\nCURRENT FILE:\n${src.slice(0, 8000)}`;
    const res = await ctx.routing.prompt(prompt, 60_000);
    if (!res.success || !res.text || res.text.trim().length < 10) continue;
    const code = res.text.replace(/^```[a-z]*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
    // Reject explanation responses — must look like actual code
    const hasSyntax = /[{};()=<>]/.test(code) || /\b(function|class|const|let|var|def|import|export|return)\b/.test(code);
    if (!hasSyntax) continue;
    try { fs.writeFileSync(absPath, code, 'utf8'); fixed = true; } catch { /* unwritable */ }
  }
  return fixed;
}

/**
 * Run the built project, detect crashes, auto-fix with AI up to MAX_RETRIES times.
 * Appends status messages to ctx.conversation. Skips HTML-only projects.
 */
export async function runAutoFix(ctx: BuildContext, builtFiles: string[]): Promise<void> {
  const cmd = detectRunCommand(ctx.root);
  if (!cmd) return; // HTML-only or no detectable run command

  // [FIX] Install deps before running. A missing node_modules makes npm/node commands fail with
  // "Cannot find module", which would be misread as a runtime crash and trigger pointless AI source
  // rewrites. Install first so the run actually exercises the built code; skip the check if it fails.
  if ((cmd.startsWith('npm') || cmd.startsWith('node')) && needsNodeInstall(ctx.root)) {
    appendMsg(ctx, 'Installing dependencies (npm install) before the run check...');
    const installErr = await installNodeDeps(ctx.root);
    if (installErr) {
      updateLastMsg(ctx, `Skipped runtime check -- ${installErr}`);
      return;
    }
    updateLastMsg(ctx, 'Dependencies installed. Running the project...');
  }

  let result = await runProject(ctx.root);

  if (result.success) {
    const label = result.isServer
      ? `[!] Server started -- still running after 8s (good). Run \`${result.command}\` to start it again.`
      : `[!] Ran successfully.${result.output ? '\n\`\`\`\n' + result.output.slice(0, 400) + '\n\`\`\`' : ''}`;
    appendMsg(ctx, label);
    return;
  }

  appendMsg(ctx, `Runtime error detected -- auto-fixing (up to ${MAX_RETRIES} attempt${MAX_RETRIES > 1 ? 's' : ''})...`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    updateLastMsg(ctx, `Runtime auto-fix attempt ${attempt}/${MAX_RETRIES}...`);
    const didFix = await aiFixRuntimeError(ctx, result.output, builtFiles);
    if (!didFix) {
      updateLastMsg(ctx,
        `Could not auto-fix runtime error.\n\`\`\`\n${result.output.slice(0, 600)}\n\`\`\`\nPaste the error above into chat for help.`);
      return;
    }
    result = await runProject(ctx.root);
    if (result.success) {
      updateLastMsg(ctx, `Runtime error fixed after ${attempt} attempt${attempt > 1 ? 's' : ''}. ${result.isServer ? 'Server started.' : 'Ran successfully.'}`);
      return;
    }
  }

  updateLastMsg(ctx,
    `After ${MAX_RETRIES} attempts, runtime still fails.\n\`\`\`\n${result.output.slice(0, 800)}\n\`\`\`\nDescribe what the app should do and I will fix it.`);
}
