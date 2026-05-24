// [SCOPE] Session Service orchestrator — thin facade over interview and storage modules
// Split from 242-line monolith. Each responsibility now lives in its own file under 200 lines.

import * as vscode from 'vscode';
import type { SessionInfo, ExitInterview } from '../types/index.js';
import type { ChassisService } from './chassisService.js';
import { runExitInterview } from './sessionInterview.js';
import { generateId } from './sessionStorage.js';
import { finalizeSession, parseEndSessionData } from './sessionServiceFinalize.js';

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

  /** Start a session WITHOUT user prompts — used for auto-session on first message */
  startSessionSilent(goal: string, ai: string = 'CHASSIS'): SessionInfo {
    if (this.currentSession) { return this.currentSession; }
    const id = generateId();
    this.currentSession = {
      id,
      startedAt: new Date().toISOString(),
      ai,
      goal,
      changes: [],
    };
    this.chassis.appendWorkLog(
      `- **Session Start** — ID: ${id}\n` +
      `- AI: ${ai}\n` +
      `- Goal: ${goal}`
    );
    const config = this.chassis.loadConfig();
    if (config) {
      config.sessions.push(id);
      this.chassis.saveConfig(config);
    }
    vscode.commands.executeCommand('setContext', 'chassis.sessionActive', true);
    return this.currentSession;
  }

  /** Record a change in the current session */
  recordChange(file: string, action: string, result: 'worked' | 'failed' | 'partial', next: string): void {
    if (!this.currentSession) { return; }
    this.currentSession.changes.push({
      file,
      action,
      result,
      next,
      timestamp: new Date().toISOString(),
    });
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
      this.doFinalizeSession(interview);
    }

    this.currentSession = null;
    // [WARN] Directly manipulating VS Code UI context.
    vscode.commands.executeCommand('setContext', 'chassis.sessionActive', false);

    // Tier 3 memory: extract learned facts from this session's chat history
    try {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (root) {
        const { LearnedMemoryService } = await import('./learnedMemoryService.js');
        const { ChatPanel } = await import('../ui/panels/chat/chatPanel.js');
        const learned = new LearnedMemoryService(root);
        learned.pruneRecent();
        const panel = ChatPanel.currentPanel;
        const userMsgs = (panel?.getConversation() || [])
          .filter((m: any) => m.role === 'user')
          .map((m: any) => m.content as string);
        if (userMsgs.length > 0 && panel) {
          const routing = panel.getRouting();
          const { permanent, recent } = await LearnedMemoryService.extractFacts(userMsgs, routing);
          permanent.forEach(f => learned.addPermanent(f));
          recent.forEach(f => learned.addRecent(f));
        }
      }
    } catch { /* never block session end */ }

    vscode.window.showInformationMessage('CHASSIS session ended. Roadmap updated.');
  }

  async endSessionWithData(data: any): Promise<void> {
    if (!this.currentSession) { return; }
    finalizeSession(this.currentSession, this.chassis, parseEndSessionData(data));
    this.currentSession = null;
    vscode.commands.executeCommand('setContext', 'chassis.sessionActive', false);
    vscode.window.showInformationMessage('CHASSIS session ended. Roadmap updated.');
  }

  private doFinalizeSession(interview: ExitInterview): void {
    finalizeSession(this.currentSession!, this.chassis, interview);
  }
}