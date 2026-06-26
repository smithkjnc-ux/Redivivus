// [SCOPE] Guardian service types — interfaces for config, health scores, risk reports, file metrics, ELI5 entries
// Shared by guardianService and all guardian submodules. No logic here.

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
