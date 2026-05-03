// [SCOPE] Status bar — shows CHASSIS state at bottom of VS Code

import * as vscode from 'vscode';
import { ChassisService } from '../services/chassisService.js';
import { SessionService } from '../services/sessionService.js';

export class StatusBar {
  private item: vscode.StatusBarItem;

  constructor(
    private chassis: ChassisService,
    private sessions: SessionService
  ) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left, 100
    );
  }

  activate(context: vscode.ExtensionContext): void {
    this.update();
    this.item.show();
    context.subscriptions.push(this.item);

    // update periodically
    const interval = setInterval(() => this.update(), 5000);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });
  }

  update(): void {
    if (!this.chassis.isInitialized()) {
      this.item.text = '$(gear) CHASSIS: Not initialized';
      this.item.tooltip = 'Run "CHASSIS: Initialize Project" to get started';
      this.item.command = 'chassis.init';
      this.item.color = '#888';
      return;
    }

    const config = this.chassis.loadConfig();
    const bp = config?.blueprint;

    if (this.sessions.isActive) {
      const session = this.sessions.session;
      this.item.text = `$(play) CHASSIS: ${session?.ai || 'Active'}`;
      this.item.tooltip = `Session: ${session?.goal || 'In progress'}\nClick to end session`;
      this.item.command = 'chassis.endSession';
      this.item.color = '#4ec959';
    } else if (bp && bp.locked) {
      this.item.text = '$(check) CHASSIS: Ready';
      this.item.tooltip = `${config?.projectName || 'Project'} — Blueprint locked\nClick to start session`;
      this.item.command = 'chassis.startSession';
      this.item.color = '#3b9dff';
    } else {
      if (bp && bp.who) {
        this.item.text = '$(edit) CHASSIS: Draft';
        this.item.tooltip = 'Blueprint drafted but not locked. Click to review.';
        this.item.command = 'chassis.openBlueprint';
        this.item.color = '#f5a623';
      } else {
        this.item.text = '$(warning) CHASSIS: No Blueprint';
        this.item.tooltip = 'Blueprint not completed. Click to run interview.';
        this.item.command = 'chassis.blueprint';
        this.item.color = '#f5a623';
      }
    }
  }
}
