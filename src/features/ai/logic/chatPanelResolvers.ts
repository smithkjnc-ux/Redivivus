// [SCOPE] Chat Panel Resolvers — handles UI modal resolution callbacks
export const _pendingBuildConfirms = new Map<string, (confirmed: boolean) => void>();
export const _pendingPlacements = new Map<string, (choice: 'here' | 'new-project' | 'cancel') => void>();

export function resolvePlacement(placementId: string, choice: 'here' | 'new-project' | 'cancel'): void {
  const resolve = _pendingPlacements.get(placementId);
  if (resolve) { _pendingPlacements.delete(placementId); resolve(choice); }
}

export function resolveBuildConfirm(buildId: string, confirmed: boolean): void {
  const resolve = _pendingBuildConfirms.get(buildId);
  if (resolve) { _pendingBuildConfirms.delete(buildId); resolve(confirmed); }
}
