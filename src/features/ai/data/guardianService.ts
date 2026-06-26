// [SCOPE] Redivivus Guardian Service orchestrator — thin facade over health, risk, and ELI5 modules
// Split from 327-line monolith. Each responsibility now lives in its own file under 200 lines.

import * as vscode from 'vscode';
import type { RedivivusService } from '../../../features/vscode/logic/redivivusService.js';
import type { GuardianConfig, HealthScore, RiskReport, FileMetrics, ELI5Entry } from './guardianTypes.js';
import { computeHealthScore } from './guardianHealth.js';
import { scanForRisks, analyzeFileMetrics } from './guardianRisk.js';
import { translateToELI5 } from './guardianELI5.js';

export class GuardianService {
  private config: GuardianConfig;

  constructor(private redivivusService: RedivivusService) {
    // Default guardian settings tuned for non-technical users
    this.config = {
      maxFunctionLines: 50,
      maxFileLines: 500,
      securityBlockPatterns: [
        "password\\s*=\\s*[\"']",
        "api[_-]?key\\s*=\\s*[\"']",
        "secret\\s*=\\s*[\"']",
        "eval\\(",
        "innerHTML\\s*=",
        "document\\.write",
        "SELECT\\s+.*\\s+FROM\\s+.*\\$\\{",
        "exec\\(.*?\\$\\{",
      ],
      architectureBlockPatterns: [
        "localStorage\\.setItem\\(.*password",
        "writeFileSync\\(.*\\.json",
        "sqlite3\\s*\\.\\s*Database\\(.*:memory:",
      ],
      requireAcknowledgment: true,
    };
  }

  // ── health score (delegated to guardianHealth)

  computeHealthScore(): HealthScore {
    return computeHealthScore(this.redivivusService);
  }

  // ── risk scanning (delegated to guardianRisk)

  scanForRisks(filePath: string, content: string): RiskReport[] {
    return scanForRisks(filePath, content, this.config);
  }

  analyzeFileMetrics(content: string): FileMetrics {
    return analyzeFileMetrics(content, this.config);
  }

  // ── ELI5 translation (delegated to guardianELI5)

  translateToELI5(technical: string, sessionId: string): ELI5Entry {
    return translateToELI5(technical, sessionId);
  }

  // ── risk acknowledgment (orchestrator-only — requires VSCode UI)

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

  // ── config management (orchestrator-only)

  updateConfig(updates: Partial<GuardianConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  getConfig(): Readonly<GuardianConfig> {
    return { ...this.config };
  }
}
