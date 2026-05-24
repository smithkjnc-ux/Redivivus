// [SCOPE] Wizard Service orchestrator — thin facade over new project, active session, backup pending, and normal workflow modules
// Split from 232-line monolith. Each responsibility now lives in its own file under 200 lines.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { ChassisService } from '../../../services/chassisService';
import type { SessionService } from '../../../services/sessionService';
import { handleNewProjectWizard } from './wizardNewProject';
import { handleActiveSessionWizard } from './wizardActiveSession';
import { handleBackupPendingWizard } from './wizardBackupPending';
import { handleNormalWorkflowWizard } from './wizardNormalWorkflow';

export class WizardService {
  constructor(
    private chassis: ChassisService,
    private sessions: SessionService
  ) {}

  async run(): Promise<void> {
    if (!this.chassis.hasWorkspace()) {
      vscode.window.showErrorMessage('Open a project folder first, then try again.');
      return;
    }

    const initialized = this.chassis.isInitialized();
    const config = initialized ? this.chassis.loadConfig() : null;
    const hasBlueprint = config?.blueprint?.who ? true : false;
    const blueprintLocked = config?.blueprint?.locked || false;
    const sessionActive = this.sessions.isActive;
    const backupExists = initialized && fs.existsSync(path.join(this.chassis.chassisDir, 'backup'));
    const hasAnalysis = initialized && fs.existsSync(path.join(this.chassis.chassisDir, 'project_map.md'));

    // ── Brand new project (delegated to wizardNewProject)
    if (!initialized) {
      await handleNewProjectWizard();
      return;
    }

    // ── Active session (delegated to wizardActiveSession)
    if (sessionActive) {
      await handleActiveSessionWizard(this.sessions.session);
      return;
    }

    // ── Backup pending (delegated to wizardBackupPending)
    if (backupExists) {
      await handleBackupPendingWizard();
      return;
    }

    // ── Normal workflow (delegated to wizardNormalWorkflow)
    await handleNormalWorkflowWizard(this.chassis);
  }
}