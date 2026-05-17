// [SCOPE] Shared types and constants for the Vault system — VaultItem, categories
// Rebuilt to spec: ~/.chassis-vault/{category}/{name}_{hash}.json

export const VAULT_CATEGORIES = [
  'component', 'utility', 'algorithm', 'pattern', 'config',
  'api', 'database', 'auth', 'validation', 'error', 'testing', 'network', 'other',
] as const;
export type VaultCategory = typeof VAULT_CATEGORIES[number];

// [WARN] Old ExtractedBlock kept for backward compat during migration
export interface ExtractedBlock {
  filePath: string;
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'method' | 'component' | 'custom';
  code: string;
  language: string;
  lines: [number, number];
}

// [SCOPE] VaultItem per spec — flat structure with all metadata fields
export interface VaultItem {
  id: string;           // uuid or contentHash
  name: string;           // function/class name
  code: string;           // the actual code block
  language: string;       // ts, js, py, etc.
  category: string;       // component, utility, auth, database, etc.
  description: string;    // one-line AI-generated description
  sourceProject: string;  // project it came from
  sourceFile: string;     // original file path
  tags: string[];         // searchable tags
  lineCount: number;      // how many lines
  importCount: number;    // times imported into projects
  createdAt: string;      // ISO timestamp
  contentHash: string;    // hash of code for dedup
  // [CHASSIS] AI quality gate fields — populated by vaultQualityGate.ts
  useCase?: string;       // AI: "when you would use this"
  qualityScore?: number;  // AI: 1-5 quality rating (3+ = worth saving)
  reusable?: boolean;     // AI: judgment on reusability
}
