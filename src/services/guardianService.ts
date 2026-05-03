// [SCOPE] CHASSIS Guardian Mentor — Non-Technical Guardian feature set
// [NEXT] Implement Level 4 Block triggers and real-time Health Score computation
// [WARN] Blocked operations require explicit user Risk Acknowledgment — do not bypass

import * as vscode from 'vscode';
import { ChassisService } from './chassisService.js';

export interface GuardianConfig {
  /** Max function length (lines) before File Split intervention */
  maxFunctionLines: number;
  /** Max file length (lines) before File Split intervention */
  maxFileLines: number;
  /** Security patterns that trigger a Block */
  securityBlockPatterns: string[];
  /** Architectural drift patterns that trigger a Block */
  architectureBlockPatterns: string[];
  /** Whether to require explicit Risk Acknowledgment before unblocking */
  requireAcknowledgment: boolean;
}

export interface HealthScore {
  /** Overall score from 0–100 */
  score: number;
  /** Breakdown by category */
  breakdown: HealthBreakdown;
  /** Current confidence level from blueprint */
  blueprintConfidence: 'high' | 'medium' | 'low';
  /** Human-readable summary for status bar display */
  summary: string;
}

export interface HealthBreakdown {
  security: number;       // 0–100
  modularity: number;       // 0–100
  maintainability: number; // 0–100
  blueprintAlignment: number; // 0–100
}

export interface RiskReport {
  /** Severity of the risk */
  severity: 'info' | 'caution' | 'stop' | 'block';
  /** Short title for the risk */
  title: string;
  /** Detailed explanation in plain English */
  description: string;
  /** File path where the risk was detected */
  filePath?: string;
  /** Line number where the risk was detected */
  lineNumber?: number;
  /** Suggested fix or next step */
  suggestion?: string;
  /** Whether user has acknowledged and wants to proceed anyway */
  acknowledged: boolean;
}

export interface FileMetrics {
  /** Total lines in the file */
  totalLines: number;
  /** Number of functions/methods found */
  functionCount: number;
  /** Longest function length (lines) */
  longestFunctionLines: number;
  /** Whether file exceeds safe thresholds */
  needsSplit: boolean;
}

export interface ELI5Entry {
  /** Original technical action text */
  technical: string;
  /** Translated plain English outcome */
  plainEnglish: string;
  /** Timestamp of the action */
  timestamp: string;
  /** Session ID this entry belongs to */
  sessionId: string;
}

export class GuardianService {
  private config: GuardianConfig;

  constructor(private chassisService: ChassisService) {
    // Default guardian settings tuned for non-technical users
    this.config = {
      maxFunctionLines: 50,
      maxFileLines: 500,
      securityBlockPatterns: [
        'password\s*=\s*["\']',
        'api[_-]?key\s*=\s*["\']',
        'secret\s*=\s*["\']',
        'eval\(',
        'innerHTML\s*=',
        'document\.write',
        'SELECT\s+.*\s+FROM\s+.*\$\{',
        'exec\(.*?\$\{',
      ],
      architectureBlockPatterns: [
        'localStorage\.setItem\(.*password',
        'writeFileSync\(.*\.json',
        'sqlite3\s*\.\s*Database\(.*:memory:',
      ],
      requireAcknowledgment: true,
    };
  }

  /**
   * [SCOPE] Compute the real-time Blueprint Health Score for status bar display
   * [NEXT] Integrate with analyzerService for file-level metrics
   */
  computeHealthScore(): HealthScore {
    const config = this.chassisService.loadConfig();
    const bp = config?.blueprint;

    // Blueprint confidence factor
    let blueprintAlignment = 0;
    if (bp) {
      const total = bp.health.confirmed + bp.health.assumed + bp.health.unknown;
      if (total > 0) {
        blueprintAlignment = Math.round(((bp.health.confirmed * 100) + (bp.health.assumed * 50)) / total);
      }
    }

    // Modularity: penalize if no src/ or tests/ structure exists
    let modularity = 50; // start neutral
    const root = this.chassisService['workspaceRoot']; // access private via index for now
    // TODO: use proper path checks once workspaceRoot is exposed

    // Security: start at 80, will drop when scans detect issues
    const security = 80;

    // Maintainability: blend of structure and documentation
    const maintainability = Math.round((blueprintAlignment + modularity) / 2);

    const score = Math.round((security + modularity + maintainability + blueprintAlignment) / 4);

    let summary = 'Health: Good';
    if (score < 40) summary = 'Health: CRITICAL — Review needed';
    else if (score < 60) summary = 'Health: At Risk — Check warnings';
    else if (score < 80) summary = 'Health: Fair — Room to improve';

    return {
      score,
      breakdown: { security, modularity, maintainability, blueprintAlignment },
      blueprintConfidence: (bp?.health.confidence || 'low') as 'high' | 'medium' | 'low',
      summary,
    };
  }

  /**
   * [SCOPE] Scan file content for security vulnerabilities and architectural drift
   * [WARN] Returns a Block-level report if any securityBlockPattern or architectureBlockPattern matches
   */
  scanForRisks(filePath: string, content: string): RiskReport[] {
    const risks: RiskReport[] = [];
    const lines = content.split('\n');

    // Security scan
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of this.config.securityBlockPatterns) {
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
      for (const pattern of this.config.architectureBlockPatterns) {
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
    const metrics = this.analyzeFileMetrics(content);
    if (metrics.needsSplit) {
      risks.push({
        severity: metrics.totalLines > this.config.maxFileLines * 2 ? 'block' : 'stop',
        title: metrics.totalLines > this.config.maxFileLines * 2 ? 'File Too Large — Blocked' : 'File Getting Too Long',
        description: `This file is ${metrics.totalLines} lines long. For non-technical projects, big files are hard to read, debug, and fix. Splitting into smaller pieces makes your project safer and easier to manage.`,
        filePath,
        suggestion: 'Use the CHASSIS "Clean Up File" or "Restructure Project" feature to split this into smaller files.',
        acknowledged: false,
      });
    }

    return risks;
  }

  /**
   * [SCOPE] Analyze file metrics for modularity health
   */
  analyzeFileMetrics(content: string): FileMetrics {
    const lines = content.split('\n');
    const totalLines = lines.length;

    // Naive function detection: lines starting with function/const/let/var + = or (
    // TODO: improve with language-aware parsing
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

    const needsSplit = totalLines > this.config.maxFileLines || longestFunctionLines > this.config.maxFunctionLines;

    return { totalLines, functionCount, longestFunctionLines, needsSplit };
  }

  /**
   * [SCOPE] Convert a technical work-log entry to plain English (ELI5)
   */
  translateToELI5(technical: string, sessionId: string): ELI5Entry {
    // Dictionary of common technical terms → plain English
    const translations: Record<string, string> = {
      'OAuth callback': 'the part that lets you log in with Google or Facebook',
      'refactor': 'reorganized the code so it is cleaner and easier to fix later',
      'unit test': 'added a small check to make sure a feature works correctly',
      'dependency injection': 'made the code more flexible so parts can be swapped out easily',
      'WebSocket': 'set up real-time messaging so the screen updates instantly',
      'API endpoint': 'created a new web address the app can talk to',
      'middleware': 'added a helper that checks things before a request is handled',
      'database migration': 'updated the data storage layout safely',
      'CI/CD': 'set up automatic testing so bugs get caught before going live',
    };

    let plainEnglish = technical;
    for (const [term, translation] of Object.entries(translations)) {
      if (plainEnglish.toLowerCase().includes(term.toLowerCase())) {
        plainEnglish = plainEnglish.replace(new RegExp(term, 'gi'), translation);
      }
    }

    // Fallback generic simplification
    if (plainEnglish === technical) {
      plainEnglish = `Made a technical improvement: ${technical}. In plain terms, this helps the app work more reliably.`;
    }

    return {
      technical,
      plainEnglish,
      timestamp: new Date().toISOString(),
      sessionId,
    };
  }

  /**
   * [SCOPE] Require explicit user acknowledgment before unblocking a blocked operation
   * [WARN] Never auto-dismiss Block-level risks
   */
  async requestRiskAcknowledgment(risk: RiskReport): Promise<boolean> {
    if (!this.config.requireAcknowledgment) {
      return true;
    }

    const message = [
      `🔴 BLOCKED: ${risk.title}`,
      '',
      risk.description,
      '',
      `📁 File: ${risk.filePath}${risk.lineNumber ? ` (line ${risk.lineNumber})` : ''}`,
      '',
      `💡 Suggestion: ${risk.suggestion || 'Review this carefully before proceeding.'}`,
      '',
      'Do you want to acknowledge this risk and proceed anyway?',
    ].join('\n');

    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      'I Understand the Risk — Proceed',
      'Cancel — Fix This First'
    );

    return choice === 'I Understand the Risk — Proceed';
  }

  /**
   * [SCOPE] Update guardian configuration at runtime
   */
  updateConfig(updates: Partial<GuardianConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * [SCOPE] Return current guardian settings for display
   */
  getConfig(): Readonly<GuardianConfig> {
    return { ...this.config };
  }
}
