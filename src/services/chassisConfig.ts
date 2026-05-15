// [SCOPE] CHASSIS config read/write — loadConfig, saveConfig
// Called by chassisInit and other services. No path logic here.

import * as fs from 'fs';
import { ChassisConfig } from '../types/index.js';
import { ChassisPaths } from './project/chassisPaths.js';

export function loadConfig(paths: ChassisPaths): ChassisConfig | null {
  if (!fs.existsSync(paths.configPath)) { return null; }
  try {
    const raw = fs.readFileSync(paths.configPath, 'utf-8');
    return JSON.parse(raw) as ChassisConfig;
  } catch {
    return null;
  }
}

export function saveConfig(paths: ChassisPaths, config: ChassisConfig): void {
  fs.writeFileSync(paths.configPath, JSON.stringify(config, null, 2));
}
