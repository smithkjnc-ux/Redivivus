// [SCOPE] Roadmap entry writer — extracted from chatPanelMsgFixUtils.ts (Rule 9 split)
// Logs AI-driven file changes to the project's CHASSIS_ROADMAP.md after every build or fix.

import * as fs from 'fs';
import * as path from 'path';

/**
 * Appends a "Recent Fixes" entry to the project's CHASSIS_ROADMAP.md after every
 * AI-driven file write. Implements audit #5: pipelines must log their changes.
 * Inserts after the first *Last updated* line so new entries appear at the top.
 * No-ops silently when the roadmap is absent (non-CHASSIS projects are unaffected).
 */
export function writeProjectRoadmapEntry(root: string, heading: string, bullets: string[]): void {
  try {
    const roadmapPath = path.join(root, 'CHASSIS_ROADMAP.md');
    if (!fs.existsSync(roadmapPath)) { return; }
    const raw = fs.readFileSync(roadmapPath, 'utf-8');
    const date = new Date().toISOString().slice(0, 10);
    const entry = `\n## Recent Fixes -- ${date} (${heading})\n\n${bullets.map(b => `- ${b}`).join('\n')}\n`;
    const insertAt = raw.indexOf('\n## ');
    const updated = insertAt >= 0
      ? raw.slice(0, insertAt) + entry + raw.slice(insertAt)
      : raw + entry;
    const finalText = updated.replace(
      /\*Last updated:.*?\*/,
      `*Last updated: ${date} -- ${heading}*`
    );
    fs.writeFileSync(roadmapPath, finalText, 'utf-8');
  } catch { /* best-effort -- never block a build */ }
}
