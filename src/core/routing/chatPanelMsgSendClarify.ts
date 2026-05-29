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
  // [FIX] If the conversation already discussed features, show a blueprint summary FIRST
  // so the user can verify before building. Don't rely on AI to generate this — build it directly.
  const recentAssistant = conversation
    .filter(m => m.role === 'assistant' && m.content.length > 80 && !m.content.startsWith('__CLARIFY__'))
    .slice(-2)
    .map(m => m.content.replace(/\n---\n\*-- .*\*$/, '').trim());
  const hasPriorDiscussion = recentAssistant.length > 0 && recentAssistant.some(m => m.length > 100);

  const questions = await generateClarifyQuestions(userText, '', routing);

  // Prepend a blueprint verification question when there was prior discussion
  if (hasPriorDiscussion) {
    const planSummary = recentAssistant[recentAssistant.length - 1].slice(0, 600);
    const blueprintQ: import('../../ui/panels/chat/chatPanelClarify').ClarifyQuestion = {
      id: 'blueprint_verify',
      question: `Based on our conversation, here is the plan:\n\n${planSummary}\n\nDoes this look right?`,
      options: [
        { label: 'Yes, build this' },
        { label: 'I want to change some things' },
      ],
    };
    // Replace the generic "How do you want to proceed?" with the blueprint verification
    const filtered = questions.filter(q => q.id !== 'build_approach');
    questions.length = 0;
    questions.push(blueprintQ, ...filtered);
  }

  if (questions.length === 0) { return { routedText: userText, cancelled: false }; }

  conversation.push({ role: 'assistant', content: encodeClarifyToken(questions), timestamp: Date.now() });
  refresh();

  // [FIX] Never auto-build on timeout. If the user walks away, cancel — don't build without consent.
  const answers = await new Promise<Record<string, string>>((resolve) => {
    setPendingClarifyResolve(resolve);
    setTimeout(() => resolve({ _cancelled: 'true' } as any), 300_000);
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

    // [FIX] When blueprint was verified, assemble routedText from FULL conversation context.
    // "that sounds good, build it" is a confirmation — the REAL task is what was discussed earlier.
    if (hasPriorDiscussion && answers['blueprint_verify']) {
      // Find the original user request that started the discussion (first substantive user message)
      const userMessages = conversation.filter(m => m.role === 'user' && m.content.length > 10);
      const originalRequest = userMessages.length >= 2 ? userMessages[userMessages.length - 3]?.content || userMessages[0].content : userText;
      const featureContext = recentAssistant.join('\n\n');
      return {
        routedText: `Build: ${originalRequest}\n\nFEATURES DISCUSSED AND APPROVED BY USER:\n${featureContext}\n\n${answersBlock}`,
        cancelled: false,
      };
    }

    return { routedText: `${userText}\n\n${answersBlock}`, cancelled: false };
  }

  conversation.pop();
  refresh();
  return { routedText: userText, cancelled: false };
}
