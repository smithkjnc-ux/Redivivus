// [SCOPE] Build from vault types — BuildPlan interface for AI build planning
// Used by buildFromVaultService for planning and tracking build operations.

import { VaultItem } from './vaultService.js';

export interface BuildPlan {
  task: string;
  vaultItems: VaultItem[];
  gaps: string[];
  assembledCode: string;
  targetFile?: string;
}
