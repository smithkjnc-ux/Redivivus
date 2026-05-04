// [SCOPE] Shared types and constants for the Vault system — VaultItem, ExtractedBlock, VaultCategory
export const VAULT_CATEGORIES = [
  'component', 'utility', 'algorithm', 'pattern', 'config',
  'api', 'database', 'auth', 'validation', 'error', 'testing', 'other',
] as const;
export type VaultCategory = typeof VAULT_CATEGORIES[number];

export interface ExtractedBlock {
  filePath: string;
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'method' | 'component' | 'custom';
  code: string;
  language: string;
  lines: [number, number];
}

export interface VaultItem {
  id: string;
  block: ExtractedBlock;
  tags: string[];
  subcategory?: string;
  contentHash?: string;
  lines?: [number, number];
}
