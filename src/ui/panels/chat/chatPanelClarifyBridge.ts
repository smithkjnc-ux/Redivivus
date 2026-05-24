// [SCOPE] Shared clarify callback — bridges orchestrator promise and webview message handler
// Module-level so both chatPanelOrchestrator and chatPanelMessageRouterEarlyExits can access it.

let _pendingClarifyResolve: ((answers: Record<string, string>) => void) | undefined;

export function setPendingClarifyResolve(resolve: (answers: Record<string, string>) => void): void {
  _pendingClarifyResolve = resolve;
}

export function resolvePendingClarify(answers: Record<string, string>): boolean {
  if (_pendingClarifyResolve) {
    _pendingClarifyResolve(answers);
    _pendingClarifyResolve = undefined;
    return true;
  }
  return false;
}
