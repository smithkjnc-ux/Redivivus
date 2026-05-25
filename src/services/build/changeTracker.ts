// [SCOPE] Change Tracker — auto-summarizes every modification Redivivus makes

import * as fs from 'fs';
import type { RedivivusService } from '../redivivusService.js';

interface ChangeSummary {
  file: string;
  ai: string;
  timestamp: string;
  linesBefore: number;
  linesAfter: number;
  linesAdded: number;
  linesRemoved: number;
  annotationsAdded: string[];
  warnings: string[];
  action: string;
}

export class ChangeTracker {
  constructor(private redivivus: RedivivusService) {}

  summarize(filePath: string, before: string, after: string, ai: string, action: string): ChangeSummary {
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');

    // count new annotations
    const annotationsAdded: string[] = [];
    const tags = ['[SCOPE]', '[TODO]', '[NEXT]', '[WARN]', '[DEAD]', '[DONE]'];
    for (const tag of tags) {
      const escapedTag = tag.replace(/[\[\]]/g, '\\$&');
      const beforeCount = (before.match(new RegExp(escapedTag, 'g')) || []).length;
      const afterCount = (after.match(new RegExp(escapedTag, 'g')) || []).length;
      const diff = afterCount - beforeCount;
      if (diff > 0) {
        annotationsAdded.push(tag + ' x' + diff);
      }
    }

    // detect warnings
    const warnings: string[] = [];
    if (afterLines.length < beforeLines.length * 0.85) {
      warnings.push('Code reduced by ' + Math.round((1 - afterLines.length / beforeLines.length) * 100) + '%');
    }
    if (afterLines.length > beforeLines.length * 1.3) {
      warnings.push('Code grew by ' + Math.round((afterLines.length / beforeLines.length - 1) * 100) + '%');
    }

    return {
      file: filePath,
      ai,
      timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
      linesBefore: beforeLines.length,
      linesAfter: afterLines.length,
      linesAdded: Math.max(0, afterLines.length - beforeLines.length),
      linesRemoved: Math.max(0, beforeLines.length - afterLines.length),
      annotationsAdded,
      warnings,
      action,
    };
  }

  log(summary: ChangeSummary): void {
    const annotations = summary.annotationsAdded.length > 0
      ? summary.annotationsAdded.join(', ')
      : 'none';

    let entry = '- Action: ' + summary.action + '\n';
    entry += '- File: ' + summary.file + '\n';
    entry += '- AI: ' + summary.ai + '\n';
    entry += '- Lines: ' + summary.linesBefore + ' \u2192 ' + summary.linesAfter;
    entry += ' (+' + summary.linesAdded + ' / -' + summary.linesRemoved + ')\n';
    entry += '- Annotations added: ' + annotations + '\n';

    if (summary.warnings.length > 0) {
      entry += '- \u26a0\ufe0f Warnings: ' + summary.warnings.join(', ') + '\n';
    }

    this.redivivus.appendWorkLog(entry);
  }

  formatNotification(summary: ChangeSummary): string {
    const parts: string[] = [];
    parts.push(summary.file);
    parts.push(summary.linesBefore + ' \u2192 ' + summary.linesAfter + ' lines');
    if (summary.annotationsAdded.length > 0) {
      parts.push(summary.annotationsAdded.join(', '));
    }
    return parts.join(' | ');
  }
}
