// [SCOPE] Chat send-message clarify step — asks design questions before intent routing
import type { ChatMessage } from '../../ui/panels/chat/chatPanelHtml';
import type { RoutingService } from '../../services/ai/routingService';
import { generateClarifyQuestions, encodeClarifyToken, formatAnswersForPrompt } from '../../ui/panels/chat/chatPanelClarify';
import { setPendingClarifyResolve } from '../../ui/panels/chat/chatPanelClarifyBridge';

export interface ChatClarifyResult {
  routedText: string;
  cancelled: boolean;
}

export async function runChatClarifyStep(
  userText: string,
  routing: RoutingService,
  conversation: ChatMessage[],
  refresh: () => void,
): Promise<ChatClarifyResult> {
  const questions = await generateClarifyQuestions(userText, '', routing);
  if (questions.length === 0) { return { routedText: userText, cancelled: false }; }

  conversation.push({ role: 'assistant', content: encodeClarifyToken(questions), timestamp: Date.now() });
  refresh();

  const answers = await new Promise<Record<string, string>>((resolve) => {
    setPendingClarifyResolve(resolve);
    setTimeout(() => resolve({}), 120_000);
  });

  if ((answers as any)._cancelled === 'true') {
    conversation[conversation.length - 1].content = '❌ Build canceled.';
    refresh();
    return { routedText: '', cancelled: true };
  }

  const answersBlock = formatAnswersForPrompt(answers);
  if (answersBlock) {
    const summary = Object.entries(answers).map(([q, a]) => `  • ${q}: **${a}**`).join('\n');
    conversation[conversation.length - 1].content = `✅ Got it — building with your choices:\n${summary}`;
    refresh();
    return { routedText: `${userText}\n\n${answersBlock}`, cancelled: false };
  }

  conversation.pop();
  refresh();
  return { routedText: userText, cancelled: false };
}
