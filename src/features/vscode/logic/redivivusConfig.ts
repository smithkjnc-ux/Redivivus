// [SCOPE] Redivivus config read/write — loadConfig, saveConfig
// Called by redivivusInit and other services. No path logic here.

import * as fs from 'fs';
import type { RedivivusConfig } from '../../../types/index.js';
import type { RedivivusPaths } from '../../project/logic/redivivusPaths.js';

export function loadConfig(paths: RedivivusPaths): RedivivusConfig | null {
  if (!fs.existsSync(paths.configPath)) { return null; }
  try {
    const raw = fs.readFileSync(paths.configPath, 'utf-8');
    return JSON.parse(raw) as RedivivusConfig;
  } catch {
    return null;
  }
}

export function saveConfig(paths: RedivivusPaths, config: RedivivusConfig): void {
  fs.writeFileSync(paths.configPath, JSON.stringify(config, null, 2));
}
