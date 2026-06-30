// [SCOPE] Role assignment service — maps available AI providers to Supervisor/Guardian/Worker roles.
// Roles are ranked by model tier, not hardcoded. Single-model mode supported automatically.
// Call assignRoles(buildRegistrations(keyMap)) to compute the full assignment.
//
// [FIX] Rank is now derived from the PRO-tier model (what Supervisor calls actually use), not the
// theoretical best model for the provider. Previously getBestModelForProvider('claude') assumed
// Opus (rank 100) was accessible, but the actual Supervisor call used Sonnet or Haiku. This caused
// Claude's routing rank to be wildly inflated relative to its real execution capability, so a
// provider with GPT-4o at rank 80 would lose the routing lottery but actually run a better model
// than Claude if only Haiku (rank 65) was accessible. Rank must match what will actually execute.

import { getModelRank } from './modelTierList.js';
import { bestModelForRole } from '../data/modelRegistry.js';

export interface ModelRegistration {
  modelId: string;
  providerId: string;
  apiKeyRef: string;       // SecretStorage key reference: 'redivivus.apikey.<provider>'
  rank: number;            // rank of the PRO-tier model — what Supervisor calls actually use
  status: 'active' | 'degraded' | 'failed';
  failureCount: number;
}

export interface RoleAssignment {
  supervisor: ModelRegistration;   // highest ranked active model (Supervisor + Guardian)
  guardian: ModelRegistration;     // same as supervisor
  workers: ModelRegistration[];    // all other active models (degraded models still work)
  isSingleModelMode: boolean;      // true when only 1 model configured
}

const PROVIDER_ORDER = ['claude', 'gemini', 'openai', 'xai', 'groq', 'kimi'] as const;

/** Build one registration per provider that has a key configured.
 *  Rank is based on the PRO-tier model for the provider — the tier actually used for Supervisor
 *  calls — so routing reflects real execution capability, not the theoretical ceiling. */
export function buildRegistrations(keyMap: Record<string, () => string | null>): ModelRegistration[] {
  const registrations: ModelRegistration[] = [];
  for (const provider of PROVIDER_ORDER) {
    if (!keyMap[provider]?.()) { continue; }
    // Use the pro-tier model (Supervisor/Guardian tier) for rank — same model the call will use.
    // Falls back to ultra then flash if pro isn't defined for this provider.
    const supervisorModel = bestModelForRole(provider, 'pro')
      ?? bestModelForRole(provider, 'ultra')
      ?? bestModelForRole(provider, 'flash');
    const modelId = supervisorModel?.modelId ?? provider;
    const rank = getModelRank(modelId);
    registrations.push({
      modelId,
      providerId: provider,
      apiKeyRef: `redivivus.apikey.${provider}`,
      rank,
      status: 'active',
      failureCount: 0,
    });
  }
  return registrations;
}

/** Pure function — assign roles from a list of registrations, sorted by rank.
 *  Supervisor/Guardian = highest active rank. Workers = all others. */
export function assignRoles(models: ModelRegistration[]): RoleAssignment {
  const active = models
    .filter(m => m.status !== 'failed')
    .sort((a, b) => b.rank - a.rank);

  if (active.length === 0) {
    const empty: ModelRegistration = {
      modelId: 'none', providerId: 'none', apiKeyRef: '',
      rank: 0, status: 'failed', failureCount: 999,
    };
    return { supervisor: empty, guardian: empty, workers: [], isSingleModelMode: true };
  }

  const supervisor = active[0];
  return {
    supervisor,
    guardian: supervisor,      // Guardian === Supervisor — same reasoning depth required
    workers: active.slice(1),
    isSingleModelMode: active.length === 1,
  };
}

/** Build registrations and assign roles in one call. */
export function computeAssignment(keyMap: Record<string, () => string | null>): RoleAssignment {
  return assignRoles(buildRegistrations(keyMap));
}
