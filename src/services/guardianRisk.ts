// [SCOPE] Guardian risk scanning — scanForRisks and analyzeFileMetrics for security, architecture, and modularity
// Called by guardianService. No health score or ELI5 logic here.

import { GuardianConfig, RiskReport, FileMetrics } from './guardianTypes.js';

export function scanForRisks(filePath: string, content: string, config: GuardianConfig): RiskReport[] {
  const risks: RiskReport[] = [];
  const lines = content.split('\n');

  // Security scan
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of config.securityBlockPatterns) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(lines[i])) {
        risks.push({
          severity: 'block',
          title: 'Security Risk Detected',
          description: 'This line may contain a hardcoded secret or unsafe operation. Hardcoding passwords, API keys, or using eval/innerHTML can let attackers steal data or take over your project.',
          filePath,
          lineNumber: i + 1,
          suggestion: 'Remove the hardcoded value. Use environment variables or a secure vault. Ask the AI for help setting this up safely.',
          acknowledged: false,
        });
      }
    }
    for (const pattern of config.architectureBlockPatterns) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(lines[i])) {
        risks.push({
          severity: 'block',
          title: 'Unsafe Architecture Detected',
          description: 'This pattern suggests storing sensitive data in a simple file or memory-only database. If your app grows or your computer restarts, you could lose everything or leak private info.',
          filePath,
          lineNumber: i + 1,
          suggestion: 'Use a proper database (like PostgreSQL or SQLite on disk) with encryption for passwords. Ask the AI to show you the safe way.',
          acknowledged: false,
        });
      }
    }
  }

  // File size check
  const metrics = analyzeFileMetrics(content, config);
  if (metrics.needsSplit) {
    risks.push({
      severity: metrics.totalLines > config.maxFileLines * 2 ? 'block' : 'stop',
      title: metrics.totalLines > config.maxFileLines * 2 ? 'File Too Large — Blocked' : 'File Getting Too Long',
      description: `This file is ${metrics.totalLines} lines long. For non-technical projects, big files are hard to read, debug, and fix. Splitting into smaller pieces makes your project safer and easier to manage.`,
      filePath,
      suggestion: 'Use the CHASSIS "Clean Up File" or "Restructure Project" feature to split this into smaller files.',
      acknowledged: false,
    });
  }

  return risks;
}

export function analyzeFileMetrics(content: string, config: GuardianConfig): FileMetrics {
  const lines = content.split('\n');
  const totalLines = lines.length;

  // Naive function detection: lines starting with function/const/let/var + = or (
  // [TODO] improve with language-aware parsing
  let functionCount = 0;
  let longestFunctionLines = 0;
  let currentFunctionLines = 0;
  let inFunction = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(function\s|const\s+\w+\s*=\s*(async\s)?function\(|\w+\s*\(.*\)\s*\{)/.test(trimmed)) {
      if (inFunction) {
        longestFunctionLines = Math.max(longestFunctionLines, currentFunctionLines);
      }
      inFunction = true;
      currentFunctionLines = 1;
      functionCount++;
    } else if (inFunction) {
      currentFunctionLines++;
      if (trimmed === '}' || /^\s*\}\s*$/.test(line)) {
        longestFunctionLines = Math.max(longestFunctionLines, currentFunctionLines);
        inFunction = false;
        currentFunctionLines = 0;
      }
    }
  }
  if (inFunction) {
    longestFunctionLines = Math.max(longestFunctionLines, currentFunctionLines);
  }

  const needsSplit = totalLines > config.maxFileLines || longestFunctionLines > config.maxFunctionLines;

  return { totalLines, functionCount, longestFunctionLines, needsSplit };
}
