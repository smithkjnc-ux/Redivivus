// [SCOPE] Session management — start, end, exit interview

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SessionInfo, ExitInterview } from '../types/index.js';
import { ChassisService } from './chassisService.js';

export class SessionService {
  private currentSession: SessionInfo | null = null;

  constructor(private chassis: ChassisService) {}

  get isActive(): boolean {
    return this.currentSession !== null;
  }

  get session(): SessionInfo | null {
    return this.currentSession;
  }

  async startSession(goalParam?: string, aiParam?: string): Promise<SessionInfo | null> {
    if (this.currentSession) {
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
      goal = await vscode.window.showInputBox({
        title: 'CHASSIS — Start Session',
        prompt: 'What\'s the goal for this session?',
        placeHolder: 'e.g., Wire WebSocket bridge to avatar, Fix auth bug',
        ignoreFocusOut: true,
      }) || undefined;
    }
    if (!goal) { return null; }

    if (!ai) {
      ai = await vscode.window.showQuickPick(
        ['Claude', 'Gemini', 'DeepSeek', 'Llama', 'Windsurf', 'Cursor', 'Manual', 'Other'],
        { placeHolder: 'Which AI are you working with this session?' }
      ) || undefined;
    }

    const id = this.generateId();
    this.currentSession = {
      id,
      startedAt: new Date().toISOString(),
      ai: ai || 'Unknown',
      goal,
      changes: [],
    };

    // log session start
    this.chassis.appendWorkLog(
      `- **Session Start** — ID: ${id}\n` +
      `- AI: ${this.currentSession.ai}\n` +
      `- Goal: ${goal}`
    );

    // update config
    const config = this.chassis.loadConfig();
    if (config) {
      config.sessions.push(id);
      this.chassis.saveConfig(config);
    }

    // set context for menu visibility
    vscode.commands.executeCommand('setContext', 'chassis.sessionActive', true);

    vscode.window.showInformationMessage(`CHASSIS session started: ${goal}`);
    return this.currentSession;
  }

  async endSession(): Promise<void> {
    if (!this.currentSession) {
      vscode.window.showWarningMessage('No active session to end.');
      return;
    }

    // exit interview
    const interview = await this.runExitInterview();

    if (interview) {
      // log exit
      this.chassis.appendWorkLog(
        `- **Session End** — ID: ${this.currentSession.id}\n` +
        `- Duration: ${this.getDuration()}\n` +
        `- Completed: ${interview.completed.join(', ') || 'none'}\n` +
        `- In Progress: ${interview.inProgress.join(', ') || 'none'}\n` +
        `- Risks: ${interview.risks.join(', ') || 'none'}\n` +
        `- Next session: ${interview.nextSessionStart}`
      );

      // save session file
      this.saveSessionFile(interview);
    }

    this.currentSession = null;
    vscode.commands.executeCommand('setContext', 'chassis.sessionActive', false);
    vscode.window.showInformationMessage('CHASSIS session ended.');
  }

  async endSessionWithData(data: any): Promise<void> {
    if (!this.currentSession) { return; }

    const interview = {
      completed: data.completed ? data.completed.split(',').map((s: string) => s.trim()) : [],
      inProgress: data.inProgress ? data.inProgress.split(',').map((s: string) => s.trim()) : [],
      risks: data.risks ? data.risks.split(',').map((s: string) => s.trim()) : [],
      nextSessionStart: data.nextStart || '',
    };

    this.chassis.appendWorkLog(
      '- **Session End** — ID: ' + this.currentSession.id + '\n' +
      '- Duration: ' + this.getDuration() + '\n' +
      '- Completed: ' + (interview.completed.join(', ') || 'none') + '\n' +
      '- In Progress: ' + (interview.inProgress.join(', ') || 'none') + '\n' +
      '- Risks: ' + (interview.risks.join(', ') || 'none') + '\n' +
      '- Next session: ' + interview.nextSessionStart
    );

    this.saveSessionFile(interview);
    this.currentSession = null;
    vscode.commands.executeCommand('setContext', 'chassis.sessionActive', false);
    vscode.window.showInformationMessage('CHASSIS session ended.');
  }

  private async runExitInterview(): Promise<ExitInterview | null> {
    const completed = await vscode.window.showInputBox({
      title: 'CHASSIS Exit Interview (1/4)',
      prompt: 'What was completed this session?',
      placeHolder: 'e.g., WebSocket bridge connected, mouth sync working',
      ignoreFocusOut: true,
    });
    if (completed === undefined) { return null; }

    const inProgress = await vscode.window.showInputBox({
      title: 'CHASSIS Exit Interview (2/4)',
      prompt: 'What\'s still in progress?',
      placeHolder: 'e.g., Eye calibration not finalized, chat API not wired',
      ignoreFocusOut: true,
    });
    if (inProgress === undefined) { return null; }

    const risks = await vscode.window.showInputBox({
      title: 'CHASSIS Exit Interview (3/4)',
      prompt: 'Any new risks or concerns?',
      placeHolder: 'e.g., Edge TTS rate limited, model file too large',
      ignoreFocusOut: true,
    });
    if (risks === undefined) { return null; }

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

  private saveSessionFile(interview: ExitInterview): void {
    if (!this.currentSession) { return; }

    const content = JSON.stringify({
      ...this.currentSession,
      endedAt: new Date().toISOString(),
      exitInterview: interview,
    }, null, 2);

    const filePath = path.join(
      this.chassis.sessionsDir,
      `${this.currentSession.id}.json`
    );
    fs.writeFileSync(filePath, content);
  }

  private getDuration(): string {
    if (!this.currentSession) { return 'unknown'; }
    const start = new Date(this.currentSession.startedAt).getTime();
    const now = Date.now();
    const mins = Math.round((now - start) / 60000);
    if (mins < 60) { return `${mins}m`; }
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  private generateId(): string {
    const d = new Date();
    const date = d.toISOString().split('T')[0].replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 6);
    return `${date}_${rand}`;
  }
}
