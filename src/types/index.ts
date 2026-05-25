// [SCOPE] Redivivus type definitions — Phase 1 core types only

export interface Blueprint {
  who: string;
  what: string;
  where: string;
  when: string;
  why: string;
  health: BlueprintHealth;
  locked: boolean;
  lockedAt?: string;
  version: string;
}

export interface BlueprintHealth {
  confirmed: number;
  assumed: number;
  unknown: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface SessionInfo {
  id: string;
  startedAt: string;
  ai: string;
  goal: string;
  changes: ChangeEntry[];
  buildMode?: 'plan' | 'direct';
}

export interface ChangeEntry {
  timestamp: string;
  file: string;
  action: string;
  result: 'worked' | 'failed' | 'partial';
  next: string;
}

export interface DeadEnd {
  timestamp: string;
  attempted: string;
  failedBecause: string;
  lesson: string;
}

export interface ExitInterview {
  completed: string[];
  inProgress: string[];
  risks: string[];
  nextSessionStart: string;
}

export interface RedivivusConfig {
  projectName: string;
  createdAt: string;
  version: string;
  blueprint: Blueprint;
  sessions: string[];  // session IDs
  autoCommit?: 'auto' | 'prompt' | 'off';  // auto-commit on successful build
  lastScan?: string;  // timestamp of last project scan
  scanResults?: ScanResults;  // results from last project scan
  savePoints?: SavePoint[];  // git save points
  manualCompletedSteps?: number[];  // steps manually marked done by user
  totalBuilds?: number;
}

export interface ScanResults {
  largeFiles: Array<{ relativePath: string; lines: number }>;
  todos: Array<{ file: string; line: string }>;
  uncommented: Array<{ relativePath: string; lines: number }>;
}

export interface SavePoint {
  id: string;
  timestamp: string;
  message: string;
  hash: string;
}

// Annotation tag types
export type AnnotationTag = 'DONE' | 'NEXT' | 'TODO' | 'WARN' | 'DEAD' | 'SCOPE';

export const ANNOTATION_TAGS: Record<AnnotationTag, { label: string; description: string }> = {
  DONE:  { label: '✅ DONE',  description: 'Task completed, verified' },
  NEXT:  { label: '➡️ NEXT',  description: 'What to do next in this area' },
  TODO:  { label: '📋 TODO',  description: 'Known incomplete work' },
  WARN:  { label: '⚠️ WARN',  description: 'Something fragile or risky' },
  DEAD:  { label: '💀 DEAD',  description: 'Tried this, didn\'t work' },
  SCOPE: { label: '🔒 SCOPE', description: 'Boundary — don\'t expand beyond this' },
};