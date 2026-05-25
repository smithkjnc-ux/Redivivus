// [SCOPE] Wizard active session logic — handles options when a session is running (analyze, review, restructure, end)
// Called by wizardService. No other wizard logic here.

import * as vscode from 'vscode';
import type { SessionInfo } from '../../../types/index';

export async function handleActiveSessionWizard(session: SessionInfo | null): Promise<void> {
  const options: any[] = [
    {
      label: '$(eye)  Check a file before I change it',
      description: 'See what\'s in the file and what Redivivus recommends',
      _command: 'redivivus.checkFileHealth',
    },
    {
      label: '$(comment)  Have AI review my current file',
      description: 'Get feedback on bugs, risks, and suggestions',
      _command: 'redivivus.reviewFile',
    },
    {
      label: '$(wand)  Clean up a file',
      description: 'AI adds helpful notes and warnings to the code',
      _command: 'redivivus.cleanUpFile',
    },
    {
      label: '$(debug-stop)  I\'m done for now',
      description: 'Wrap up this session — I\'ll ask a few quick questions',
      detail: 'Goal was: ' + (session?.goal || ''),
      _command: 'redivivus.endSession',
    },
  ];

  const pick = await vscode.window.showQuickPick(options, {
    title: 'Redivivus — Working with ' + (session?.ai || 'AI'),
    placeHolder: 'What do you need?',
  });
  if (pick) {await vscode.commands.executeCommand((pick as any)._command);}
}
