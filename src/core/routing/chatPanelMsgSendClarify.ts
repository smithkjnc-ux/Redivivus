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
    // [FIX] Format requirements as bullet points for easy reading and verification.
    // Combine user's explicit requirements + prior AI discussion into a clean list.
    const bulletize = (text: string): string => {
      // Split on sentence boundaries, periods, commas with clauses, or newlines
      const parts = text
        .replace(/\.\s+/g, '.\n')
        .split(/\n|(?<=\w)[,;](?=\s+[A-Z])|(?<=\w)[,;](?=\s+(and|with|must|should|it|the|a|an)\s)/i)
        .map(s => s.replace(/^[-•*]\s*/, '').trim())
        .filter(s => s.length > 5 && !/^(yes|ok|sure|let|would you|do you|I'd)\b/i.test(s));
      return parts.map(p => `- ${p}`).join('\n');
    };
    const userBullets = userText.length > 20 ? bulletize(userText) : '';
    const priorBullets = bulletize(recentAssistant[recentAssistant.length - 1].slice(0, 600));
    const allBullets = [userBullets, priorBullets].filter(Boolean).join('\n');
    // Deduplicate similar bullets
    const seen = new Set<string>();
    const uniqueBullets = allBullets.split('\n').filter(line => {
      const key = line.toLowerCase().replace(/[^a-z]/g, '').slice(0, 30);
      if (seen.has(key)) { return false; }
      seen.add(key);
      return true;
    }).join('\n');

    const blueprintQ: import('../../ui/panels/chat/chatPanelClarify').ClarifyQuestion = {
      id: 'blueprint_verify',
      question: `Build Plan:\n\n${uniqueBullets}\n\nBuild with these requirements?`,
      options: [
        { label: 'Yes, build this' },
        { label: 'I want to change some things' },
      ],
    };
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

  // [FIX] "Build it now — AI decides everything" on Q1 means no design preferences — just build.
  // Including build_approach in the design preferences block sends nonsensical instructions to the
  // cloud AI (it would try to implement "build_approach: Build it now" as a feature).
  const wantsBuildNow = answers['build_approach']?.toLowerCase().includes('now');
  if (wantsBuildNow) {
    conversation[conversation.length - 1].content = '⚡ Building now...';
    refresh();
    return { routedText: userText, cancelled: false };
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

// [RULE 18] AI judgment replaces the old bug-keyword regex + spec-length heuristic.
// Returns true when the request needs clarifying questions, false when it is clear enough to build.
// Fallback: reproduces the old heuristic when the AI is unreachable.
export async function shouldClarify(userText: string, routing: RoutingService): Promise<boolean> {
  const prompt =
    'A developer sent this build request. Does it have enough detail to start building immediately, or does it need clarifying questions first?\n\n' +
    'Reply CLEAR if:\n' +
    '- It describes a specific bug, error, or broken behavior\n' +
    '- It includes specific requirements (features, behavior, appearance)\n' +
    '- It names a concrete thing to add or change with enough context to act on\n\n' +
    'Reply VAGUE if:\n' +
    '- It is a one-liner with no specifics ("make a game", "build an app")\n' +
    '- Multiple very different interpretations are equally valid\n' +
    '- The core details needed to build anything are completely absent\n\n' +
    'Respond with exactly one word: CLEAR or VAGUE\n\n' +
    `Request: "${userText.slice(0, 400)}"`;

  try {
    const result = await routing.promptCheap(prompt, 8_000);
    return result.text.trim().toUpperCase().startsWith('VAGUE');
  } catch {
    // Offline fallback: reproduce prior heuristic so behavior degrades gracefully
    const lower = userText.toLowerCase();
    const isBugReport = /\b(fix|broken|bug|doesn't work|not working|error|crash|fail|glitch|stuck|missing|wrong)\b/i.test(lower);
    const hasSpecs = userText.length > 50 && /\b(should|must|need|require|include|have)\b/i.test(lower);
    return !isBugReport && !hasSpecs;
  }
}
