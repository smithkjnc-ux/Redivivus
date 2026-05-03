// [SCOPE] CHASSIS Wizard — friendly guided workflow, non-technical language

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChassisService } from './chassisService.js';
import { SessionService } from './sessionService.js';

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

    // ── Brand new project ──
    if (!initialized) {
      const pick = await vscode.window.showQuickPick([
        {
          label: '$(add)  I\'m starting something new',
          description: 'Set up a fresh project with CHASSIS',
          detail: 'I\'ll ask a few questions about what you\'re building, then set everything up for you.',
          _command: 'new',
        },
        {
          label: '$(tools)  I have existing code that needs organizing',
          description: 'Clean up and restructure an existing project',
          detail: 'I\'ll scan your files, show you what needs work, and fix it — with your approval.',
          _command: 'retrofit',
        },
        {
          label: '$(question)  What is CHASSIS?',
          description: 'Show me what this can do',
          detail: 'A quick guide explaining how CHASSIS helps you code better.',
          _command: 'guide',
        },
      ], {
        title: 'Welcome to CHASSIS',
        placeHolder: 'What would you like to do?',
      });

      if (!pick) return;
      const cmd = (pick as any)._command;

      if (cmd === 'new') {
        await vscode.commands.executeCommand('chassis.init');
        if (this.chassis.isInitialized()) {
          const bp = await vscode.window.showInformationMessage(
            'Project set up! Want to answer a few questions so CHASSIS knows what you\'re building?',
            { modal: true },
            'Sure', 'Maybe later'
          );
          if (bp === 'Sure') {
            await vscode.commands.executeCommand('chassis.blueprint');
          }
        }
      } else if (cmd === 'retrofit') {
        await vscode.commands.executeCommand('chassis.wizardRetrofit');
      } else {
        await vscode.commands.executeCommand('chassis.guide');
      }
      return;
    }

    // ── Active session ──
    if (sessionActive) {
      const session = this.sessions.session;
      const options: any[] = [
        {
          label: '$(eye)  Check a file before I change it',
          description: 'See what\'s in the file and what CHASSIS recommends',
          _command: 'chassis.analyzeFile',
        },
        {
          label: '$(comment)  Have AI review my current file',
          description: 'Get feedback on bugs, risks, and suggestions',
          _command: 'chassis.reviewFile',
        },
        {
          label: '$(wand)  Clean up my current file',
          description: 'AI adds helpful notes and warnings to the code',
          _command: 'chassis.restructureFile',
        },
        {
          label: '$(debug-stop)  I\'m done for now',
          description: 'Wrap up this session — I\'ll ask a few quick questions',
          detail: 'Goal was: ' + (session?.goal || ''),
          _command: 'chassis.endSession',
        },
      ];

      const pick = await vscode.window.showQuickPick(options, {
        title: 'CHASSIS — Working with ' + (session?.ai || 'AI'),
        placeHolder: 'What do you need?',
      });
      if (pick) await vscode.commands.executeCommand((pick as any)._command);
      return;
    }

    // ── Backup pending ──
    if (backupExists) {
      const pick = await vscode.window.showQuickPick([
        {
          label: '$(check)  Everything works — keep the changes',
          description: 'Delete the backup and move forward',
          _command: 'chassis.confirmRetrofit',
        },
        {
          label: '$(discard)  Something broke — undo everything',
          description: 'Restore all original files from backup',
          _command: 'chassis.revertRetrofit',
        },
        {
          label: '$(folder-opened)  Let me test first',
          description: 'Close this and go check your project',
          _command: 'none',
        },
      ], {
        title: 'CHASSIS — You have a pending retrofit',
        placeHolder: 'Your files were restructured. Did everything work?',
      });
      if (pick && (pick as any)._command !== 'none') {
        await vscode.commands.executeCommand((pick as any)._command);
      }
      return;
    }

    // ── Normal workflow ──
    const options: any[] = [];

    // suggest the most logical next action first
    if (!hasBlueprint) {
      options.push({
        label: '$(checklist)  Tell CHASSIS about this project',
        description: 'Answer 5 quick questions — takes about 2 minutes',
        detail: 'This helps CHASSIS understand what you\'re building.',
        _command: 'chassis.blueprint',
      });
    }

    options.push({
      label: '$(play)  Start working',
      description: 'Begin a coding session — name your goal',
      detail: 'Everything you do gets tracked in the work log.',
      _command: 'chassis.startSession',
    });

    if (!hasAnalysis) {
      options.push({
        label: '$(search)  Scan my project',
        description: 'See how many files, what\'s big, what needs work',
        detail: 'Quick scan — no AI needed, just file analysis.',
        _command: 'chassis.analyze',
      });
    }

    options.push({
      label: '$(eye)  Check a file',
      description: 'See what\'s in a file and what CHASSIS would do to it',
      _command: 'chassis.analyzeFile',
    });

    options.push({
      label: '$(comment)  Have AI review a file',
      description: 'Get smart feedback on your current file',
      _command: 'chassis.reviewFile',
    });

    options.push({
      label: '$(wand)  Clean up a file',
      description: 'AI adds helpful notes and warnings',
      _command: 'chassis.restructureFile',
    });

    options.push({
      label: '$(tools)  Restructure entire project',
      description: 'Clean up all files at once — backed up first',
      _command: 'chassis.retrofit',
    });

    options.push({
      label: '$(sparkle)  Switch AI',
      description: 'Change which AI does the work',
      _command: 'chassis.switchAI',
    });

    // files section
    options.push({
      label: '$(history)  View work log',
      description: 'See what happened in past sessions',
      _command: 'chassis.log',
    });

    options.push({
      label: '$(file-text)  View blueprint',
      description: 'Your project plan',
      _command: 'chassis.openBlueprint',
    });

    options.push({
      label: '$(book)  Help',
      description: 'How to use CHASSIS',
      _command: 'chassis.guide',
    });

    const pick = await vscode.window.showQuickPick(options, {
      title: 'CHASSIS' + (config ? ' — ' + config.projectName : ''),
      placeHolder: 'What would you like to do?',
    });

    if (pick) {
      await vscode.commands.executeCommand((pick as any)._command);
    }
  }
}
