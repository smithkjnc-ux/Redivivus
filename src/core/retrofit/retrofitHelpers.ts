// [SCOPE] Retrofit helper functions — marker conversion, summary dialog, and report generation
// Called by retrofitService.ts orchestrator only. No VS Code panel or file-walk logic here.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export async function handleAllAnnotated(doneFiles: string[]): Promise<void> {
  const filesWithOldMarkers: string[] = [];
  for (const f of doneFiles) {
    try {
      const fc = fs.readFileSync(f, 'utf-8');
      if (fc.split('\n').some(l =>
        /\b(TODO|FIXME|HACK|XXX|BUG)\b/i.test(l) && !/\[(TODO|WARN|NEXT|DEAD|DONE|SCOPE)\]/i.test(l)
      )) { filesWithOldMarkers.push(f); }
    } catch { /* skip unreadable */ }
  }

  if (filesWithOldMarkers.length === 0) {
    await vscode.window.showInformationMessage(
      '✅ All files are annotated and all markers are in Redivivus format. Nothing to do!',
      { modal: true }
    );
    return;
  }

  const fix = await vscode.window.showInformationMessage(
    'All files have [SCOPE] — but ' + filesWithOldMarkers.length + ' file(s) still have bare legacy markers.',
    { modal: true, detail: 'Redivivus can convert them to [TODO], [WARN], [DEAD] format in-place. No AI needed.\n\nFiles affected: ' + filesWithOldMarkers.length },
    'Convert Markers', 'Cancel'
  );
  if (fix !== 'Convert Markers') { return; }

  const tagMap: Record<string, string> = { todo: '[TODO]', fixme: '[WARN]', hack: '[WARN]', xxx: '[DEAD]', bug: '[WARN]' };
  let fixed = 0;
  for (const f of filesWithOldMarkers) {
    try {
      const ext = path.extname(f).toLowerCase().slice(1);
      const ch = ['py', 'sh', 'bash', 'yaml', 'yml', 'rb'].includes(ext) ? '#' : '//';
      const lines = fs.readFileSync(f, 'utf-8').split('\n').map(line => {
        if (/\[(TODO|WARN|NEXT|DEAD|DONE|SCOPE)\]/i.test(line)) { return line; }
        return line.replace(/(?:\/\/|\/\*|#)?\s*\b(TODO|FIXME|HACK|XXX|BUG)\b\s*:?\s*/gi,
          (_m: string, kw: string) => ch + ' ' + tagMap[kw.toLowerCase()] + ' ');
      });
      fs.writeFileSync(f, lines.join('\n'));
      fixed++;
    } catch { /* skip */ }
  }
  vscode.window.showInformationMessage('✅ Converted legacy markers in ' + fixed + ' file(s) to Redivivus format.');
}

export async function showRetrofitSummary(
  projectName: string,
  pendingFiles: string[],
  doneFiles: string[]
): Promise<string | undefined> {
  const MAX_SHOW = 10;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const pendingSnippet = pendingFiles.slice(0, MAX_SHOW).map(f => '  🔵 ' + path.relative(root, f)).join('\n') +
    (pendingFiles.length > MAX_SHOW ? '\n  ... and ' + (pendingFiles.length - MAX_SHOW) + ' more' : '');
  const doneSnippet = doneFiles.length > 0
    ? 'Already done: ' + doneFiles.length + ' file' + (doneFiles.length === 1 ? '' : 's') + '\n\n'
    : '';
  return vscode.window.showInformationMessage(
    'Redivivus Retrofit — ' + projectName,
    {
      modal: true,
      detail: 'Project: ' + projectName + '\n\nPending (' + pendingFiles.length + '):\n' + pendingSnippet + '\n\n' +
        doneSnippet + 'What happens:\n1. Your current project is backed up to .redivivus/backup/\n' +
        '2. Pending files get Redivivus annotations added by AI\n3. Already-done files are skipped\n' +
        '4. You test, then confirm or revert\n\nEstimated time: ~' + Math.ceil(pendingFiles.length * 0.5) +
        ' minutes (' + pendingFiles.length + ' files)'
    },
    'Start Retrofit', 'View Recommendations'
  );
}

export function buildReport(results: { file: string; status: string }[], total: number, failed: number): string {
  let report = '# Redivivus Retrofit Report\n\n';
  report += '*Retrofit completed: ' + new Date().toISOString().split('T')[0] + '*\n\n---\n\n## Summary\n\n';
  report += '- Files processed: ' + total + '\n- Successful: ' + (total - failed) + '\n- Failed: ' + failed + '\n- Backup location: `.redivivus/backup/`\n\n';
  report += '## Results\n\n| File | Status |\n|------|--------|\n';
  for (const r of results) {
    const icon = r.status === 'OK' ? '\u2705' : r.status.startsWith('SKIP') ? '\u23ed\ufe0f' : '\u274c';
    report += '| ' + r.file + ' | ' + icon + ' ' + r.status + ' |\n';
  }
  report += '\n---\n\n## Next Steps\n\n';
  report += '1. **Test your project** — make sure everything still works\n';
  report += '2. If good: run **Redivivus: Confirm Retrofit** to delete the backup\n';
  report += '3. If bad: run **Redivivus: Revert Retrofit** to restore original files\n';
  return report;
}
