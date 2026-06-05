// [SCOPE] Chat Panel header utilities — pure helpers extracted from chatPanelHeader.ts (Rule 9 split).

/** Returns blueprint completeness based on how many of the 5 W's are filled in. */
export function determineBlueprintStatus(config: any): 'complete' | 'incomplete' | 'missing' {
  if (!config?.blueprint) { return 'missing'; }
  const bp = config.blueprint;
  const filled = ['who', 'what', 'where', 'when', 'why'].filter(f => bp[f] && bp[f].trim().length > 0);
  if (filled.length === 5) { return 'complete'; }
  if (filled.length > 0) { return 'incomplete'; }
  return 'missing';
}
