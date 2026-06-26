// [SCOPE] Session finalization helpers — extracted from sessionService.ts (Rule 9 split)

import type { SessionInfo, ExitInterview } from '../../../types/index.js';
import type { RedivivusService } from '../../../features/vscode/logic/redivivusService.js';
import { saveSessionFile, getDuration } from './sessionStorage.js';

export function finalizeSession(session: SessionInfo, redivivus: RedivivusService, interview: ExitInterview): void {
  redivivus.appendWorkLog(
    '- **Session End** — ID: ' + session.id + '\n' +
    '- Duration: ' + getDuration(session) + '\n' +
    '- Completed: ' + (interview.completed.join(', ') || 'none') + '\n' +
    '- In Progress: ' + (interview.inProgress.join(', ') || 'none') + '\n' +
    '- Risks: ' + (interview.risks.join(', ') || 'none') + '\n' +
    '- Next session: ' + interview.nextSessionStart
  );
  redivivus.appendRoadmap(session.goal, interview.completed, interview.inProgress, interview.nextSessionStart);
  saveSessionFile(session, interview, redivivus.sessionsDir);
}

export function parseEndSessionData(data: any): ExitInterview {
  return {
    completed: data.completed ? data.completed.split(',').map((s: string) => s.trim()) : [],
    inProgress: data.inProgress ? data.inProgress.split(',').map((s: string) => s.trim()) : [],
    risks: data.risks ? data.risks.split(',').map((s: string) => s.trim()) : [],
    nextSessionStart: data.nextStart || '',
  };
}
