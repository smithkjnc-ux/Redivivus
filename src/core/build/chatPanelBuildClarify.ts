// [SCOPE] Build runner clarify step — asks design questions before build execution
// Extracted from chatPanelBuildRunner.ts. Returns cancelled:true if user aborts.
import type { BuildContext } from './chatPanelBuildHelpers';

export async function runBuildClarifyStep(
  task: string,
  ctx: BuildContext,
  isFixRequest: boolean,
  skipComplex: boolean,
): Promise<{ cancelled: boolean }> {
  if (!ctx.postToWebview || isFixRequest || skipComplex || ctx.buildMode === 'direct') {
    return { cancelled: false };
  }
  const clar = await import('../../ui/panels/chat/chatPanelClarify.js');
  ctx.conversation.push({ role: 'assistant', content: 'Thinking...', timestamp: Date.now() });
  ctx.refresh();
  const questions = await clar.generateClarifyQuestions(task, ctx.blueprintContext, ctx.routing);
  if (questions.length === 0) { ctx.conversation.pop(); return { cancelled: false }; }

  const _cl = ctx.conversation[ctx.conversation.length - 1];
  if (_cl?.role === 'assistant') { _cl.content = clar.encodeClarifyToken(questions); }
  ctx.refresh();

  const answers = await Promise.race<Record<string, string>>([
    new Promise<Record<string, string>>((resolve) => { ctx.onClarifySubmit = resolve; }),
    new Promise<Record<string, string>>(resolve => setTimeout(() => resolve({}), 120_000)),
  ]);
  const _cl2 = ctx.conversation[ctx.conversation.length - 1];

  if (answers._cancelled === 'true') {
    if (_cl2?.role === 'assistant') { _cl2.content = '❌ Build canceled.'; }
    ctx.refresh(); ctx.postToWebview?.({ type: 'set-status', status: 'ready' });
    return { cancelled: true };
  }

  if (answers.build_approach?.toLowerCase().includes('now')) {
    if (_cl2?.role === 'assistant') { _cl2.content = '⚡ Building now — AI decides everything...'; }
    ctx.refresh();
  } else {
    const da = Object.fromEntries(
      Object.entries(answers)
        .filter(([k]) => !k.endsWith('_detail') && k !== 'build_approach' && k !== '_cancelled')
        .filter(([k, v]) => k !== 'anything_else' || !!v.trim())
        .map(([k, v]) => [k === 'anything_else' ? 'Additional details' : k, answers[k + '_detail'] ? `${v} — ${answers[k + '_detail']}` : v])
    );
    const ab = clar.formatAnswersForPrompt(da);
    const summary = Object.entries(da).map(([q, a]) => `  • ${q}: **${a}**`).join('\n');
    if (_cl2?.role === 'assistant') {
      _cl2.content = summary ? `✅ Got it — building with your choices:\n${summary}` : '✅ Got it — building now...';
    }
    ctx.refresh();
    if (ab) { ctx.clarifyAnswers = ab; }
  }
  return { cancelled: false };
}
