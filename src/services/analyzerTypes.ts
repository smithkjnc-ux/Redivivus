// [SCOPE] Shared types for the CHASSIS analyzer — FileInfo and AnalysisResult

export interface FileInfo {
  relativePath: string;
  extension: string;
  lines: number;
  size: number;
  todos: string[];
  hasComments: boolean;
}

export interface AnalysisResult {
  totalFiles: number;
  totalLines: number;
  filesByType: Record<string, number>;
  largeFiles: FileInfo[];
  todoItems: { file: string; line: string }[];
  uncommentedFiles: FileInfo[];
  structure: string[];
}
