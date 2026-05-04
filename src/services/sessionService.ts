// [SCOPE] Session Service orchestrator — thin facade over interview and storage modules
// Split from 242-line monolith. Each responsibility now lives in its own file under 200 lines.

import * as vscode from 'vscode';
import { SessionInfo, ExitInterview } from '../types/index.js';
import { ChassisService } from './chassisService.js';
import { runExitInterview } from './sessionInterview.js';
import { saveSessionFile, generateId, getDuration } from './sessionStorage.js';

export class SessionService {
  private currentSession: SessionInfo | null = null;

  constructor(private chassis: ChassisService) {}

  get isActive(): boolean {
    return this.currentSession !== null;
  }

  get session(): SessionInfo | null {
    return this.currentSession;
  }

  // ── session start (orchestrator-only — handles user prompts and state)

  async startSession(goalParam?: string, aiParam?: string): Promise<SessionInfo | null> {
    if (this.currentSession) {
      // [WARN] User interaction point, can lead to session not starting if canceled.
      const overwrite = await vscode.window.showWarningMessage(
        'A session is already active. End it first?',
        'End & Start New', 'Cancel'
      );
      if (overwrite !== 'End & Start New') { return null; }
      await this.endSession();
    }

    let goal = goalParam;
    let ai = aiParam;

    if (!goal) {
      // [WARN] User interaction point, can lead to session not starting if canceled or empty.
      goal = await vscode.window.showInputBox({
        title: 'CHASSIS — Start Session',
        prompt: 'What\'s the goal for this session?',
        placeHolder: 'e.g., Wire WebSocket bridge to avatar, Fix auth',
        ignoreFocusOut: true,
      }) || undefined;
    }
    if (!goal) { return null; }

    if (!ai) {
      // [WARN] User interaction point, can lead to 'Unknown' AI if canceled or empty.
      ai = await vscode.window.showQuickPick(
        ['Claude', 'Gemini', 'DeepSeek', 'Llama', 'Windsurf', 'Cursor', 'Manual', 'Other'],
        { placeHolder: 'Which AI are you working with this session?' }
      ) || undefined;
    }

    const id = generateId();
    this.currentSession = {
      id,
      startedAt: new Date().toISOString(),
      ai: ai || 'Unknown',
      goal,
      changes: [],
    };

    // [WARN] Appending to work log involves file I/O.
    this.chassis.appendWorkLog(
      `- **Session Start** — ID: ${id}\n` +
      `- AI: ${this.currentSession.ai}\n` +
      `- Goal: ${goal}`
    );

    // update config
    // [WARN] Loading and saving config involves file I/O, potential for errors.
    const config = this.chassis.loadConfig();
    if (config) {
      config.sessions.push(id);
      this.chassis.saveConfig(config);
    }

    // [WARN] Directly manipulating VS Code UI context.
    vscode.commands.executeCommand('setContext', 'chassis.sessionActive', true);

    vscode.window.showInformationMessage(`CHASSIS session started: ${goal}`);
    return this.currentSession;
  }

  // ── session end (orchestrator-only — delegates interview and storage)

  async endSession(): Promise<void> {
    if (!this.currentSession) {
      vscode.window.showWarningMessage('No active session to end.');
      return;
    }

    // exit interview
    // [WARN] This involves multiple user interaction points, can be canceled.
    const interview = await runExitInterview();

    if (interview) {
      this.finalizeSession(interview);
    }

    this.currentSession = null;
    // [WARN] Directly manipulating VS Code UI context.
    vscode.commands.executeCommand('setContext', 'chassis.sessionActive', false);
    vscode.window.showInformationMessage('CHASSIS session ended. Roadmap updated.');
  }

  async endSessionWithData(data: any): Promise<void> {
    if (!this.currentSession) { return; }

    // [WARN] Fragile: relies on 'data' structure and string parsing.
    const interview = {
      completed: data.completed ? data.completed.split(',').map((s: string) => s.trim()) : [],
      inProgress: data.inProgress ? data.inProgress.split(',').map((s: string) => s.trim()) : [],
      risks: data.risks ? data.risks.split(',').map((s: string) => s.trim()) : [],
      nextSessionStart: data.nextStart || '',
    };

    this.finalizeSession(interview);
    this.currentSession = null;
    // [WARN] Directly manipulating VS Code UI context.
    vscode.commands.executeCommand('setContext', 'chassis.sessionActive', false);
    vscode.window.showInformationMessage('CHASSIS session ended. Roadmap updated.');
  }

  // ── session finalization (orchestrator-only — logs, roadmap, storage)

  private finalizeSession(interview: ExitInterview): void {
    // [WARN] Appending to work log involves file I/O.
    this.chassis.appendWorkLog(
      '- **Session End** — ID: ' + this.currentSession!.id + '\n' +
      '- Duration: ' + getDuration(this.currentSession!) + '\n' +
      '- Completed: ' + (interview.completed.join(', ') || 'none') + '\n' +
      '- In Progress: ' + (interview.inProgress.join(', ') || 'none') + '\n' +
      '- Risks: ' + (interview.risks.join(', ') || 'none') + '\n' +
      '- Next session: ' + interview.nextSessionStart
    );

    // auto-update roadmap
    // [WARN] Appending to roadmap involves file I/O.
    this.chassis.appendRoadmap(
      this.currentSession!.goal,
      interview.completed,
      interview.inProgress,
      interview.nextSessionStart
    );

    // [WARN] Saving session file involves direct file I/O.
    saveSessionFile(this.currentSession!, interview, this.chassis.sessionsDir);
  }
}