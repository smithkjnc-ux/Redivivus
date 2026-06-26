// [SCOPE] Wizard Service orchestrator — thin facade over new project, active session, backup pending, and normal workflow modules
// Split from 232-line monolith. Each responsibility now lives in its own file under 200 lines.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { RedivivusService } from '../../../../features/vscode/logic/redivivusService.js';
import type { SessionService } from '../../logic/sessionService.js';
import { handleNewProjectWizard } from './wizardNewProject.js';
import { handleActiveSessionWizard } from './wizardActiveSession.js';
import { handleBackupPendingWizard } from './wizardBackupPending.js';
import { handleNormalWorkflowWizard } from './wizardNormalWorkflow.js';

export class WizardService {
  constructor(
    private redivivus: RedivivusService,
    private sessions: SessionService
  ) {}

  async run(): Promise<void> {
    if (!this.redivivus.hasWorkspace()) {
      vscode.window.showErrorMessage('Open a project folder first, then try again.');
      return;
    }

    const initialized = this.redivivus.isInitialized();
    const config = initialized ? this.redivivus.loadConfig() : null;
    const hasBlueprint = config?.blueprint?.who ? true : false;
    const blueprintLocked = config?.blueprint?.locked || false;
    const sessionActive = this.sessions.isActive;
    const backupExists = initialized && fs.existsSync(path.join(this.redivivus.redivivusDir, 'backup'));
    const hasAnalysis = initialized && fs.existsSync(path.join(this.redivivus.redivivusDir, 'project_map.md'));

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
    await handleNormalWorkflowWizard(this.redivivus);
  }
}