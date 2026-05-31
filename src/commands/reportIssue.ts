// [SCOPE] Redivivus Report Issue — collects bug/feature report and opens feedback form in browser
import * as vscode from 'vscode';

export function registerReportIssueCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.reportIssue', async () => {
      const pkg = require('../../package.json');
      const version: string = pkg.version;
      const url = `https://github.com/smithkjnc-ux/Redivivus/issues/new?title=Bug+Report+v${encodeURIComponent(version)}&labels=bug&template=bug_report.md`;
      await vscode.env.openExternal(vscode.Uri.parse(url));
    })
  );
}
