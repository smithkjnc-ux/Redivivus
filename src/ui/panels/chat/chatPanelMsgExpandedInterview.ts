// [SCOPE] Expanded interview submit handler — compiles 5W answers, sets blueprint context, triggers build
import type { ChatMessage } from './chatPanelHtml';
import type { MessageHandlerDeps } from '../../../core/routing/chatPanelMessages';

export async function handleExpandedInterviewSubmit(
  msg: any,
  deps: MessageHandlerDeps,
  conversation: ChatMessage[],
  refresh: () => void
): Promise<void> {
  const a = msg.answers || {};
  if (!msg.skipped && Object.keys(a).length > 0) {
    const who = a['who-skill'] || a['who-type'] || '';
    const what = a['what-core'] || '';
    const features = a['what-features'] || '';
    const where = a['where-platform'] || '';
    const when = a['when-timeline'] || '';
    const why = a['why-problem'] || '';
    const ctx = [
      who && `Users: ${who}`,
      what && `Core: ${what}`,
      features && `Features: ${features}`,
      where && `Platform: ${where}`,
      when && `Timeline: ${when}`,
      why && `Problem: ${why}`,
    ].filter(Boolean).join(' | ');
    if (ctx && deps.setBlueprintContext) { deps.setBlueprintContext(ctx); }
  }
  const task = msg.prefillTask || '';
  if (task) {
    conversation.push({ role: 'user', content: task, timestamp: Date.now() });
    refresh();
    await deps.handleBuildRequest(task, false, false);
  } else {
    conversation.push({ role: 'assistant', content: "Requirements captured! Describe what you want to build and I'll use your answers as context.", timestamp: Date.now() });
    refresh();
  }
}
