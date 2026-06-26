// [SCOPE] Session storage helpers — saveSessionFile, generateId, getDuration
// Called by sessionService. No UI or session lifecycle logic here.

import * as fs from 'fs';
import * as path from 'path';
import type { SessionInfo, ExitInterview } from '../../../types/index.js';

export function saveSessionFile(session: SessionInfo, interview: ExitInterview, sessionsDir: string): void {
  const content = JSON.stringify({
    ...session,
    endedAt: new Date().toISOString(),
    exitInterview: interview,
  }, null, 2);

  const filePath = path.join(sessionsDir, `${session.id}.json`);
  // [WARN] Direct synchronous file write, can fail due to permissions, path issues, etc.
  fs.writeFileSync(filePath, content);
}

export function generateId(): string {
  const d = new Date();
  const date = d.toISOString().split('T')[0].replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6);
  return `${date}_${rand}`;
}

export function getDuration(session: SessionInfo): string {
  // [WARN] Relies on `startedAt` being a valid ISO string parsable by `Date`.
  const start = new Date(session.startedAt).getTime();
  const now = Date.now();
  const mins = Math.round((now - start) / 60000);
  if (mins < 60) { return `${mins}m`; }
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
