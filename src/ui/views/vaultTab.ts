// [SCOPE] Vault tab exporter — thin facade over data utils, scan summary, and tab renderer modules
// Split from 229-line monolith. Each responsibility now lives in its own file under 200 lines.

import { VaultService, VaultCategory, VaultItem } from '../../services/vaultService.js';
import { getVaultItems, getVaultCategoryCounts, esc } from './vaultDataUtils.js';
import { renderVaultScanSummary } from './vaultScanSummary.js';
import { renderVaultTab } from './vaultTabRenderer.js';

// Re-export all functions for backward compatibility
export { getVaultItems, getVaultCategoryCounts, esc, renderVaultScanSummary, renderVaultTab };