// [SCOPE] Role-based temperature config for the Redivivus orchestration pipeline.
// Three roles have fundamentally different optimal temperatures:
//   Supervisor (planning) — needs some creativity to decompose well (~0.4)
//   Worker     (coding)   — needs precision; high temp = hallucinated APIs (~0.2)
//   Guardian   (review)   — needs the most deterministic verdict possible (~0.0)
//
// Per-provider floor clamps are silent safety nets — some providers behave
// poorly at exactly 0.0 (e.g. Groq llama can loop). Applied inside callProvider.

export type RoleTemperatures = { supervisor: number; worker: number; guardian: number };

export const ROLE_TEMP_DEFAULTS: RoleTemperatures = {
  supervisor: 0.4,
  worker:     0.2,
  guardian:   0.0,
};

// Minimum safe temperature per provider. Applied as a floor clamp in callProvider.
// Does NOT affect user-visible settings — only prevents known model failure modes.
const PROVIDER_TEMP_FLOOR: Record<string, number> = {
  groq:     0.05,  // llama-3.x can loop on repetitive output at exactly 0.0
  xai:      0.01,
  deepseek: 0.01,
};

/** Apply provider floor clamp + range clamp [0, 1]. Called inside each provider. */
export function clampTemp(ai: string, temp: number): number {
  const floor = PROVIDER_TEMP_FLOOR[ai] ?? 0.0;
  return Math.max(floor, Math.min(1.0, temp));
}

/**
 * Resolve stored temperature config (from blueprint/session) into a RoleTemperatures object.
 * The stored object may contain existing domain keys (visual/mechanics/logic/data/security)
 * plus the new role keys (supervisor/worker/guardian) — only role keys are used here.
 */
export function resolveRoleTemps(stored?: Record<string, number> | null): RoleTemperatures {
  return {
    supervisor: stored?.supervisor ?? ROLE_TEMP_DEFAULTS.supervisor,
    worker:     stored?.worker     ?? ROLE_TEMP_DEFAULTS.worker,
    guardian:   stored?.guardian   ?? ROLE_TEMP_DEFAULTS.guardian,
  };
}
