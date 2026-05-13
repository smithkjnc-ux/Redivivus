// [SCOPE] Wizard active session logic — handles options when a session is running (analyze, review, restructure, end)
// Called by wizardService. No other wizard logic here.

import * as vscode from 'vscode';
import { SessionInfo } from '../types/index.js';

export async function handleActiveSessionWizard(session: SessionInfo | null): Promise<void> {
  const options: any[] = [
    {
      label: '$(eye)  Check a file before I change it',
      description: 'See what\'s in the file and what CHASSIS recommends',
      _command: 'chassis.checkFileHealth',
    },
    {
      label: '$(comment)  Have AI review my current file',
      description: 'Get feedback on bugs, risks, and suggestions',
      _command: 'chassis.reviewFile',
    },
    {
      label: '$(wand)  Clean up a file',
      description: 'AI adds helpful notes and warnings to the code',
      _command: 'chassis.cleanUpFile',
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
}
