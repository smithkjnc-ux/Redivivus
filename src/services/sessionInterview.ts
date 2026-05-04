// [SCOPE] Session exit interview — runs 4-step UI interview when ending a session
// Called by sessionService. No session lifecycle or file writing logic here.

import * as vscode from 'vscode';
import { ExitInterview } from '../types/index.js';

export async function runExitInterview(): Promise<ExitInterview | null> {
  // [WARN] User interaction point, can be canceled.
  const completed = await vscode.window.showInputBox({
    title: 'CHASSIS Exit Interview (1/4)',
    prompt: 'What was completed this session?',
    placeHolder: 'e.g., WebSocket bridge connected, mouth sync working',
    ignoreFocusOut: true,
  });
  if (completed === undefined) { return null; }

  // [WARN] User interaction point, can be canceled.
  const inProgress = await vscode.window.showInputBox({
    title: 'CHASSIS Exit Interview (2/4)',
    prompt: 'What\'s still in progress?',
    placeHolder: 'e.g., Eye calibration not finalized, chat API not wired',
    ignoreFocusOut: true,
  });
  if (inProgress === undefined) { return null; }

  // [WARN] User interaction point, can be canceled.
  const risks = await vscode.window.showInputBox({
    title: 'CHASSIS Exit Interview (3/4)',
    prompt: 'Any new risks or concerns?',
    placeHolder: 'e.g., Edge TTS rate limited, model file too large',
    ignoreFocusOut: true,
  });
  if (risks === undefined) { return null; }

  // [WARN] User interaction point, can be canceled.
  const nextStart = await vscode.window.showInputBox({
    title: 'CHASSIS Exit Interview (4/4)',
    prompt: 'What should the next session start with?',
    placeHolder: 'e.g., Calibrate eye positions, then wire dashboard',
    ignoreFocusOut: true,
  });
  if (nextStart === undefined) { return null; }

  return {
    completed: completed ? completed.split(',').map(s => s.trim()) : [],
    inProgress: inProgress ? inProgress.split(',').map(s => s.trim()) : [],
    risks: risks ? risks.split(',').map(s => s.trim()) : [],
    nextSessionStart: nextStart || '',
  };
}
