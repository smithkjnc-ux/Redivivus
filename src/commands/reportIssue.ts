// [SCOPE] Redivivus Report Issue — collects bug/feature report and opens feedback form in browser
import * as vscode from 'vscode';

export function registerReportIssueCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.reportIssue', async () => {
      const pkg = require('../../package.json');
      const version: string = pkg.version;
      const cfg = vscode.workspace.getConfiguration('redivivus');
      const apiBase = cfg.get<string>('apiBase') || 'https://redivivus.dev';
      const webBase = apiBase.replace('/api/v1', '');
      const url = `${webBase}/feedback?source=ide&version=${encodeURIComponent(version)}`;
      await vscode.env.openExternal(vscode.Uri.parse(url));
    })
  );
}
