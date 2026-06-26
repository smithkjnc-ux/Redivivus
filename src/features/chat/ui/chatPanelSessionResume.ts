// [SCOPE] Session resumability — reads most recent session and surfaces "pick up where you left off" context in chat
// Called once when ChatPanel constructor loads a project. Injects a context message if a recent session exists.

import * as fs from 'fs';
import * as path from 'path';
import type { ChatMessage } from './chatPanelHtml.js';

const MAX_AGE_HOURS = 48;

export function loadLastSessionContext(redivivus: any, conversation: ChatMessage[]): void {
  if (!redivivus?.isInitialized?.()) { return; }
  const sessionsDir = redivivus.sessionsDir;
  if (!sessionsDir || !fs.existsSync(sessionsDir)) { return; }

  // Find the most recently modified session file
  let latestFile: string | null = null;
  let latestMtime = 0;
  try {
    for (const f of fs.readdirSync(sessionsDir)) {
      if (!f.endsWith('.json')) { continue; }
      const fp = path.join(sessionsDir, f);
      const mtime = fs.statSync(fp).mtimeMs;
      if (mtime > latestMtime) { latestMtime = mtime; latestFile = fp; }
    }
  } catch { return; }

  if (!latestFile) { return; }

  // Only surface if it's recent enough
  const ageHours = (Date.now() - latestMtime) / 3_600_000;
  if (ageHours > MAX_AGE_HOURS) { return; }

  let session: any;
  try { session = JSON.parse(fs.readFileSync(latestFile, 'utf-8')); } catch { return; }

  const goal = session.goal || '';
  const nextStart = session.exitInterview?.nextSessionStart || '';
  const completed = (session.exitInterview?.completed || []).slice(0, 3);
  const inProgress = (session.exitInterview?.inProgress || []).slice(0, 2);
  const hoursAgo = ageHours < 1 ? 'just now' : ageHours < 24 ? `${Math.round(ageHours)}h ago` : `${Math.round(ageHours / 24)}d ago`;

  const lines: string[] = [`**&#x23F0; Last session (${hoursAgo})**`];
  if (goal) { lines.push(`_Goal: ${goal}_`); }
  if (completed.length) { lines.push(`**Done:** ${completed.join(', ')}`); }
  if (inProgress.length) { lines.push(`**In progress:** ${inProgress.join(', ')}`); }
  if (nextStart) { lines.push(`\n**Next:** ${nextStart}`); }
  lines.push('\n_Type anything to continue, or describe something new to build._');

  conversation.push({ role: 'assistant', content: lines.join('\n'), timestamp: Date.now() });
}
