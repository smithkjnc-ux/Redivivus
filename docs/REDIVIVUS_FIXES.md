# Redivivus Fixes
> Log every file change here. See REDIVIVUS_ROADMAP.md for index.

- **`src/features/chat/build/chatPanelEditBuild.ts`**: Extracted prompt generation into `chatPanelEditBuildPrompts.ts` to enforce Rule 9.
- **`src/features/chat/build/services/cloudBuildMultiFile.ts`**: Extracted fallback logic to `cloudBuildProviderFallback.ts` and Guardian step logic to `cloudBuildMultiFileHelpers.ts` to enforce Rule 9.
- **`src/features/chat/build/services/smokeTestGenerator.ts`**: Extracted helpers to `smokeTestHelpers.ts` to enforce Rule 9.
- **`src/features/chat/routing/chatPanelMessages.ts`**: Extracted architect router to `chatPanelMsgArchitectRouter.ts` to enforce Rule 9.
- **`src/features/chat/routing/chatPanelMsgSendAI.ts`**: Extracted Guardian and auto-save logics into `chatPanelMsgSendAIHelpers.ts` to enforce Rule 9.
- **`src/features/chat/ui/memoryPanelHtml.ts`**: Extracted CSS and JS strings into `memoryPanelHtmlStyles.ts` and `memoryPanelHtmlScripts.ts` to enforce Rule 9.
- **`src/shared/ai/domain/chatPanelAI.ts`**: Extracted code-generation prompts into `chatPanelAICodeGen.ts` to enforce Rule 9.
- **`src/shared/vscode/ui/filesTab.ts`**: Extracted switch form logic to `filesTabForms.ts` to enforce Rule 9.
- **`src/` (Global Phase 1, 2, 3)**: Fully migrated extension to the Hybrid Modular Monolith Architecture. 
  - Phase 1: Moved 407 primary files into `features/` (`chat`, `vault`, `project`, `workspace`, `onboarding`) and `shared/`.
  - Phase 2: Dissolved legacy `src/commands` bucket into 37 feature-specific bounded contexts (`telemetry`, `runtime`, `settings`).
  - Phase 3: Dissolved the final 129 legacy files from `src/services`, `src/ui`, and `src/core`. Established new boundaries for `features/map/`, `features/pwa/`, `shared/vscode/`, and `shared/api/`.
  - Fully automated cross-boundary TS module pathing and `import()` / `require()` dynamic path patching using bidirectional AST `ts-morph` traversals.
- **`src/features/workspace/domain/selfDiagnosticBuildChecks.ts`**: Patched `__dirname` relative path lookups to point to new `shared/ai/infrastructure` paths for `routingService.js` and `guardianAI.js`.
- **`src/lib/ai/routingServicePrompts.ts`**: (Redivivus Backend) Updated `generateSupervisorPrompt` to mandate a Bottom-Up Build Sequence (leaf dependencies first, entry points last). This ensures the AI Worker has exact, previously generated API signatures when building components that rely on them. Added strict mandates for JSDoc parameter documentation and explicitly typing constructor/method contracts in the JSON plan.
- **`/home/papajoe/projects/games/fluid-dynamics-sandbox/`**: (Test Sandbox) Fixed API mismatch between `physics.js` and `spatialHashGrid.js` caused by top-down generation order. Restructured `input.js` to return a state object. Dropped particle count to 300 and hardcoded a 3-update circuit breaker in `main.js` to stop the 2-FPS Spiral of Death caused by slow collision checking.

- **`src/core/routing/chatPanelMsgFixEscalation.ts`**: Refactored monolithic file (324 lines) into 4 separate files to comply with Rule 9. Extracted `WorkerPhase`, `VerifyPhase`, and `GuardianPhase` logics into `chatPanelMsgFixWorkerPhase.ts`, `chatPanelMsgFixVerifyPhase.ts`, and `chatPanelMsgFixGuardianPhase.ts` respectively.
- **`src/core/routing/chatPanelMsgFixWorkerPhase.ts`**: Created extracted Worker generation logic for escalation loop.
- **`src/core/routing/chatPanelMsgFixVerifyPhase.ts`**: Created extracted Verify Phase logic for escalation loop.
- **`src/core/routing/chatPanelMsgFixGuardianPhase.ts`**: Created extracted Guardian Phase logic for escalation loop.
- **`src/core/routing/chatPanelMsgFixSelfFix.ts`**: Fixed escaped template literal syntax error from generation.
