// [SCOPE] Shared types for the CHASSIS analyzer — FileInfo and AnalysisResult

export interface FileInfo {
  relativePath: string;
  extension: string;
  lines: number;
  size: number;
  todos: string[];
  hasComments: boolean;
  missingScopeAtLine1: boolean; // [CHASSIS] true = no correct [SCOPE] comment on line 1
}

export interface AnalysisResult {
  totalFiles: number;
  totalLines: number;
  filesByType: Record<string, number>;
  largeFiles: FileInfo[];
  todoItems: { file: string; line: string }[];
  uncommentedFiles: FileInfo[];
  missingScopeFiles: FileInfo[]; // [CHASSIS] files missing [SCOPE] at line 1
  structure: string[];
}
