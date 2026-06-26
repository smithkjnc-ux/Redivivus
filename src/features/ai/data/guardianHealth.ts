// [SCOPE] Guardian health score computation — computes real-time Blueprint Health Score for status bar display
// Called by guardianService. No risk scanning or ELI5 logic here.

import type { RedivivusService } from '../../../features/vscode/logic/redivivusService.js';
import type { HealthScore } from './guardianTypes.js';

export function computeHealthScore(redivivusService: RedivivusService): HealthScore {
  const config = redivivusService.loadConfig();
  const bp = config?.blueprint;

  // Blueprint confidence factor
  let blueprintAlignment = 0;
  if (bp) {
    const total = bp.health.confirmed + bp.health.assumed + bp.health.unknown;
    if (total > 0) {
      blueprintAlignment = Math.round(((bp.health.confirmed * 100) + (bp.health.assumed * 50)) / total);
    }
  }

  // Modularity: penalize if no src/ or tests/ structure exists
  let modularity = 50; // start neutral
  const root = redivivusService.getWorkspaceRoot();
  // [TODO] use proper path checks once workspaceRoot is exposed

  // Security: start at 80, will drop when scans detect issues
  const security = 80;

  // Maintainability: blend of structure and documentation
  const maintainability = Math.round((blueprintAlignment + modularity) / 2);

  const score = Math.round((security + modularity + maintainability + blueprintAlignment) / 4);

  let summary = 'Health: Good';
  if (score < 40) {summary = 'Health: CRITICAL — Review needed';}
  else if (score < 60) {summary = 'Health: At Risk — Check warnings';}
  else if (score < 80) {summary = 'Health: Fair — Room to improve';}

  return {
    score,
    breakdown: { security, modularity, maintainability, blueprintAlignment },
    blueprintConfidence: (bp?.health.confidence || 'low') as 'high' | 'medium' | 'low',
    summary,
  };
}
