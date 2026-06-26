// [SCOPE] Wizard normal workflow logic — handles standard options (blueprint, start session, scan, analyze, review, restructure, retrofit, switch AI, log, blueprint, help)
// Called by wizardService. No other wizard logic here.

import * as vscode from 'vscode';
import type { RedivivusService } from '../../../../features/vscode/logic/redivivusService.js';

export async function handleNormalWorkflowWizard(redivivus: RedivivusService): Promise<void> {
  const config = redivivus.loadConfig();
  const hasBlueprint = config?.blueprint?.who ? true : false;
  const hasAnalysis = config && redivivus.redivivusDir && require('fs').existsSync(require('path').join(redivivus.redivivusDir, 'project_map.md'));

  const options: any[] = [];

  // suggest the most logical next action first
  if (!hasBlueprint) {
    options.push({
      label: '$(checklist)  Tell Redivivus about this project',
      description: 'Answer 5 quick questions — takes about 2 minutes',
      detail: 'This helps Redivivus understand what you\'re building.',
      _command: 'redivivus.blueprint',
    });
  }

  options.push({
    label: '$(play)  Start working',
    description: 'Begin a coding session — name your goal',
    detail: 'Everything you do gets tracked in the work log.',
    _command: 'redivivus.startSession',
  });

  if (!hasAnalysis) {
    options.push({
      label: '$(search)  Scan my project',
      description: 'See how many files, what\'s big, what needs work',
      detail: 'Quick scan — no AI needed, just file analysis.',
      _command: 'redivivus.analyze',
    });
  }

  options.push({
    label: '$(eye)  Check a file',
    description: 'See what\'s in a file and what Redivivus would do to it',
    _command: 'redivivus.checkFileHealth',
  });

  options.push({
    label: '$(comment)  Have AI review a file',
    description: 'Get smart feedback on your current file',
    _command: 'redivivus.reviewFile',
  });

  options.push({
    label: '$(wand)  Clean up a file',
    description: 'AI adds helpful notes and warnings',
    _command: 'redivivus.restructureFile',
  });

  options.push({
    label: '$(tools)  Restructure entire project',
    description: 'Clean up all files at once — backed up first',
    _command: 'redivivus.retrofit',
  });

  options.push({
    label: '$(sparkle)  Switch AI',
    description: 'Change which AI does the work',
    _command: 'redivivus.switchAI',
  });

  // files section
  options.push({
    label: '$(history)  View work log',
    description: 'See what happened in past sessions',
    _command: 'redivivus.log',
  });

  options.push({
    label: '$(file-text)  View blueprint',
    description: 'Your project plan',
    _command: 'redivivus.openBlueprint',
  });

  options.push({
    label: '$(book)  Help',
    description: 'How to use Redivivus',
    _command: 'redivivus.guide',
  });

  const pick = await vscode.window.showQuickPick(options, {
    title: 'Redivivus' + (config ? ' — ' + config.projectName : ''),
    placeHolder: 'What would you like to do?',
  });

  if (pick) {
    await vscode.commands.executeCommand((pick as any)._command);
  }
}
