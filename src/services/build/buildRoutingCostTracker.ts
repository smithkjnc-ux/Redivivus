// [SCOPE] Tracks the cloudChat (intent classification) token cost per build turn.
// cloudChat runs BEFORE the /build backend call and costs real tokens, but its result is
// never returned by /build — so without this tracker the tokens are invisible in the build card.
// Pattern: recordRoutingCost() fires in chatPanelMsgSendPreCloud (after cloudChat call),
//          consumeRoutingCost() fires in chatPanelBuildRunner (just before buildBreakdownToken).
// [WARN] Module-level singleton. Safe because Redivivus only runs one build at a time
//        (input is locked while building). Do not use for concurrent multi-build scenarios.

interface RoutingCost {
  input: number;
  output: number;
  model: string;
  provider: string;
}

let _pending: RoutingCost | null = null;

/** Called in chatPanelMsgSendPreCloud after cloudChat responds. */
export function recordRoutingCost(input: number, output: number, model: string, provider: string): void {
  _pending = { input, output, model, provider };
}

/** Called in chatPanelBuildRunner — reads and clears the pending cost. Returns null if not set. */
export function consumeRoutingCost(): RoutingCost | null {
  const v = _pending;
  _pending = null;
  return v;
}
