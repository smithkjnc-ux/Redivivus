// [SCOPE] Generates system prompts for in-place edit builds (surgical updates, refactors, annotations).
import * as path from 'path';
import * as fs from 'fs';

/** Read the contents of files imported by the target file — gives the Worker awareness of existing
 *  exports/interfaces so it doesn't invent nonexistent symbols. Limited to direct local imports. */
export function gatherImportContext(absPath: string, root: string): string {
  try {
    const src = fs.readFileSync(absPath, 'utf-8');
    const importRe = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
    const seen = new Set<string>();
    const chunks: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(src)) !== null) {
      const raw = m[1];
      const dir = path.dirname(absPath);
      // Try .ts, .js, /index.ts extensions
      const candidates = [raw, raw + '.ts', raw + '.js', raw + '/index.ts'].map(c => path.resolve(dir, c));
      for (const c of candidates) {
        if (seen.has(c)) { break; }
        if (fs.existsSync(c) && fs.statSync(c).isFile()) {
          seen.add(c);
          const content = fs.readFileSync(c, 'utf-8');
          const relPath = path.relative(root, c);
          // Limit to first 80 lines to control prompt size
          const preview = content.split('\n').slice(0, 80).join('\n');
          chunks.push(`--- RELATED FILE: ${relPath} ---\n\`\`\`\n${preview}\n\`\`\``);
          break;
        }
      }
    }
    return chunks.length > 0 ? '\n\nRELATED FILES (these exist — reference their REAL exports, do NOT invent new ones):\n' + chunks.join('\n\n') + '\n' : '';
  } catch { return ''; }
}

export async function generateEditPrompt(
  issueType: string | undefined,
  task: string,
  filePath: string,
  absPath: string,
  root: string,
  originalContent: string,
  bpSection: string,
  useExcerpt: boolean,
  excerptStart: number,
  excerptEnd: number,
  excerptText: string
): Promise<string> {
  if (issueType === 'todo') {
    if (useExcerpt) {
      return `Edit this excerpt from \`${filePath}\` (lines ${excerptStart + 1}–${excerptEnd + 1}):\n\`\`\`\n${excerptText}\n\`\`\`\n\n` +
        `TASK: ${task}${bpSection}\n` +
        `RULES:\n- Return ONLY the modified excerpt (same line range, no fences, no explanation)\n` +
        `- Change [TODO] to [DONE] once the task is implemented\n` +
        `- Preserve all other [SCOPE], [WARN], [NEXT], [DEAD] annotations exactly\n` +
        `- Write real, working code — no placeholders or stubs`;
    } else {
      return `Edit this file \`${filePath}\`:\n\`\`\`\n${originalContent}\n\`\`\`\n\n` +
        `TASK: ${task}${bpSection}\n` +
        `Use SURGICAL EDITS. Output ONLY the changed parts:\n` +
        `<<<SEARCH\n[exact existing code to find]\n===\n[replacement code]\nREPLACE>>>\n\n` +
        `RULES:\n- Use <<<SEARCH...REPLACE>>> for each change. Do NOT return the full file.\n` +
        `- Change [TODO] to [DONE] once implemented\n` +
        `- Preserve all other annotations exactly\n` +
        `- Write real, working code — no placeholders\n` +
        `- If you must return a full file (e.g. file is tiny), that is also acceptable.`;
    }
  } else if (issueType === 'refactor') {
    const importCtx = gatherImportContext(absPath, root);
    let projectHistoryCtx = '';
    try {
      const { getBlueprintEvolutionContext } = await import('../fix/chatPanelMsgFixBuildCtx.js');
      const { readProjectDeadEnds } = await import('../fix/chatPanelMsgFixDeadEnds.js');
      const bpEvolution = getBlueprintEvolutionContext(root);
      const deadEnds = readProjectDeadEnds(root);
      if (bpEvolution) { projectHistoryCtx += '\n\n' + bpEvolution; }
      if (deadEnds) { projectHistoryCtx += '\n\nDEAD ENDS (approaches that failed — do NOT repeat these):\n' + deadEnds.slice(0, 2000); }
    } catch { /* best-effort */ }
    return `Refactor this file \`${filePath}\`:\n\`\`\`\n${originalContent}\n\`\`\`\n\n` +
      `TASK: ${task}${bpSection}${importCtx}${projectHistoryCtx}\n` +
      `Use SURGICAL EDITS. Output ONLY the changed parts:\n` +
      `<<<SEARCH\n[exact existing code to find]\n===\n[replacement code]\nREPLACE>>>\n\n` +
      `RULES:\n- Use <<<SEARCH...REPLACE>>> for each change. Do NOT return the full file.\n` +
      `- Make REAL code changes — not comments, not placeholders, not annotations.\n` +
      `- NEVER import from a module that does not exist. If you need a new interface or function, CREATE it in the appropriate existing file using a separate SEARCH/REPLACE block.\n` +
      `- NEVER reference a symbol unless you can see it in the file content or RELATED FILES above.\n` +
      `- You may emit multiple SEARCH/REPLACE blocks targeting DIFFERENT files by prefixing: FILE: <relativePath>\n` +
      `- If you must return a full file (e.g. file is tiny), that is also acceptable.`;
  } else {
    return `Add Redivivus annotation comments to \`${filePath}\`:\n\`\`\`\n${originalContent}\n\`\`\`\n\n` +
      `TASK: ${task}${bpSection}\n` +
      `RULES:\n- Return ONLY the complete updated file (no fences, no explanation)\n` +
      `- Add \`// [SCOPE]\` at line 1 describing what this file does in one sentence\n` +
      `- Add \`// [WARN]\` near any fragile, risky, or side-effect-heavy logic\n` +
      `- Do NOT change any existing code — comments only`;
  }
}
