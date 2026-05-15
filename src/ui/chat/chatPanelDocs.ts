// [SCOPE] CHASSIS Chat Panel Doc Generator — auto-writes docs/README.md after every build

import * as path from 'path';
import * as fs from 'fs';
import { RoutingService } from '../../services/ai/routingService.js';

/** Ask AI to write a README.md from the blueprint + file list, then save to docs/README.md */
export async function generateDocs(
  root: string,
  task: string,
  blueprintContext: string,
  files: Array<{ filename: string; purpose?: string }>,
  routing: RoutingService,
): Promise<string> {
  const fileList = files.map(f => `  - ${f.filename}${f.purpose ? `: ${f.purpose}` : ''}`).join('\n');
  const docPrompt = `Write a README.md for this project in plain English.

ORIGINAL REQUEST: "${task}"
${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}\n` : ''}FILES CREATED:
${fileList}

Write:
1. One-paragraph summary of what the program does
2. How to run / use it
3. What technologies / languages it uses
4. List of files and what each does

Keep it under 60 lines. Use markdown. Start with a # heading.`;

  try {
    const res = await routing.prompt(docPrompt, 30_000);
    if (!res.success) { return `Doc generation skipped: ${res.error || 'AI failed'}`; }
    let doc = res.text.replace(/^```markdown\n?/i, '').replace(/\n?```$/i, '').trim();
    if (!doc) { return 'Doc generation skipped: AI returned empty response'; }
    const docsDir = path.join(root, 'docs');
    if (!fs.existsSync(docsDir)) { fs.mkdirSync(docsDir, { recursive: true }); }
    fs.writeFileSync(path.join(docsDir, 'README.md'), doc, 'utf8');
    return 'docs/README.md';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Doc generation skipped: ${msg}`;
  }
}
