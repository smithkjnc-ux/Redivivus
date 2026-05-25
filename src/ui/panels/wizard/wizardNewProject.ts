// [SCOPE] Wizard new project logic — handles first-time project setup (new, retrofit, guide options)
// Called by wizardService. No other wizard logic here.

import * as vscode from 'vscode';

export async function handleNewProjectWizard(): Promise<void> {
  const pick = await vscode.window.showQuickPick([
    {
      label: '$(add)  I\'m starting something new',
      description: 'Set up a fresh project with Redivivus',
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
      label: '$(question)  What is Redivivus?',
      description: 'Show me what this can do',
      detail: 'A quick guide explaining how Redivivus helps you code better.',
      _command: 'guide',
    },
  ], {
    title: 'Welcome to Redivivus',
    placeHolder: 'What would you like to do?',
  });

  if (!pick) {return;}
  const cmd = (pick as any)._command;

  if (cmd === 'new') {
    await vscode.commands.executeCommand('redivivus.init');
    // [NEXT] After init, offer blueprint
    if (await vscode.commands.executeCommand('redivivus.isInitialized')) {
      const bp = await vscode.window.showInformationMessage(
        'Project set up! Want to answer a few questions so Redivivus knows what you\'re building?',
        { modal: true },
        'Sure', 'Maybe later'
      );
      if (bp === 'Sure') {
        await vscode.commands.executeCommand('redivivus.blueprint');
      }
    }
  } else if (cmd === 'retrofit') {
    await vscode.commands.executeCommand('redivivus.wizardRetrofit');
  } else {
    await vscode.commands.executeCommand('redivivus.guide');
  }
}
