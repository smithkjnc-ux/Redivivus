# Redivivus Fixes
> Log every file change here. See REDIVIVUS_ROADMAP.md for index.

- **`src/lib/ai/routingServicePrompts.ts`**: (Redivivus Backend) Updated `generateSupervisorPrompt` to mandate a Bottom-Up Build Sequence (leaf dependencies first, entry points last). This ensures the AI Worker has exact, previously generated API signatures when building components that rely on them. Added strict mandates for JSDoc parameter documentation and explicitly typing constructor/method contracts in the JSON plan.
- **`/home/papajoe/projects/games/fluid-dynamics-sandbox/`**: (Test Sandbox) Fixed API mismatch between `physics.js` and `spatialHashGrid.js` caused by top-down generation order. Restructured `input.js` to return a state object. Dropped particle count to 300 and hardcoded a 3-update circuit breaker in `main.js` to stop the 2-FPS Spiral of Death caused by slow collision checking.

- **`src/core/routing/chatPanelMsgFixEscalation.ts`**: Refactored monolithic file (324 lines) into 4 separate files to comply with Rule 9. Extracted `WorkerPhase`, `VerifyPhase`, and `GuardianPhase` logics into `chatPanelMsgFixWorkerPhase.ts`, `chatPanelMsgFixVerifyPhase.ts`, and `chatPanelMsgFixGuardianPhase.ts` respectively.
- **`src/core/routing/chatPanelMsgFixWorkerPhase.ts`**: Created extracted Worker generation logic for escalation loop.
- **`src/core/routing/chatPanelMsgFixVerifyPhase.ts`**: Created extracted Verify Phase logic for escalation loop.
- **`src/core/routing/chatPanelMsgFixGuardianPhase.ts`**: Created extracted Guardian Phase logic for escalation loop.
- **`src/core/routing/chatPanelMsgFixSelfFix.ts`**: Fixed escaped template literal syntax error from generation.
