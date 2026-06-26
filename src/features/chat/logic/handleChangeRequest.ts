// [SCOPE] handleChangeRequest — the single entrypoint for code-change turns (build OR fix). Phase 2 of the
// intent migration (docs/REDIVIVUS_INTENT_ARCHITECTURE.md). It consolidates the build-vs-fix dispatch that was
// scattered across handleSendMessage into ONE seam that owns the shared TurnContext.
//
// [PHASE 2a] Behaviour-preserving: this DISPATCHES to the existing build/fix pipelines (no internal rewrite)
// and records the decision on turnCtx.artifacts. The value is the single context-owning seam.
// [PHASE 2b — next] thread turnCtx (conversation + prescription) INTO the Supervisor/Worker prompts so the
// classify -> plan -> worker handoff stops being lossy ("losing something between plan and worker").
// Reversible: route build/fix back inline in handleSendMessage's final routing.

import type { MessageHandlerDeps } from './chatPanelMessages.js';
import { handleBuildIntent } from './chatPanelMsgSendBuildIntent.js';
import { handleFixRequest } from '../../fix/chatPanelMsgFix.js';
import { fixLog } from '../../../features/logging/data/fixPipelineLogger.js';

export async function handleChangeRequest(
  msg: any,
  deps: MessageHandlerDeps,
  opts: { intent: 'build' | 'fix'; routedText: string; claudeTask: string },
): Promise<void> {
  const ctx = deps.turnContext;
  // Record the routing decision on the shared context so later phases — and telemetry — can see what this turn
  // became without re-deriving it. This is the seam reading the hint and writing back an artifact.
  if (ctx) {
    ctx.artifacts.decision = opts.intent;
    fixLog(`[PHASE2] handleChangeRequest -> ${opts.intent} (conf=${ctx.hint?.confidence ?? 'n/a'})`);
  }

  if (opts.intent === 'fix') {
    let fixImage = msg.imageBase64;
    let fixImageType = msg.imageType;
    if (!fixImage) {
      try {
        const { getRuntimeReports } = await import('../ui/chatPanelPreview.js');
        const reports = getRuntimeReports();
        const latestSnapshot = [...reports].reverse().find(r => r.image);
        if (latestSnapshot && latestSnapshot.image) {
          const parts = latestSnapshot.image.split(',');
          if (parts.length === 2) {
            fixImageType = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
            fixImage = parts[1];
          }
        }
      } catch (e) {}
    }
    // Pass the user's ORIGINAL words (not the AI-rewritten task) — they drive history/vault/dead-ends.
    await handleFixRequest(ctx?.rawMessage ?? opts.routedText, deps, fixImage, fixImageType);
    return;
  }
  await handleBuildIntent(opts.routedText || opts.claudeTask, opts.claudeTask, msg, deps, deps.conversation, deps.refresh);
}
