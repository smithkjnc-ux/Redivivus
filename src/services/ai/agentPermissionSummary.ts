// [SCOPE] Agent pre-run permission summary — generates a plain English "here's what I'm about to do"
// card and waits for user confirmation before the Agent touches anything.
// Uses the existing clarify token pattern so no new webview plumbing is needed.
// Returns true if approved, false if cancelled. Falls through to true on AI failure (never blocks).

import type { MessageHandlerDeps } from '../../core/routing/chatPanelMessages.js';
import type { ChatMessage } from '../../ui/panels/chat/chatPanelHtml.js';

export interface AgentPermissionResult {
  approved: boolean;
  summary: string;
}

/** Calls promptCheap to summarise what the Agent is about to do.
 *  Returns null on any failure so callers can skip the confirmation gracefully. */
export async function buildAgentSummary(
  task: string,
  deps: MessageHandlerDeps,
  fromDiagnosis: boolean,
): Promise<string | null> {
  try {
    const prompt =
`An AI agent is about to work on this task: "${task.slice(0, 300)}"
${fromDiagnosis ? 'It will write files AND run terminal commands.' : 'The code files are already updated. It will run terminal commands to verify the result.'}

List what it will most likely do in 3-5 plain English bullet points (no jargon).
Focus on: what files it might modify, what commands it will run, what it will install or start.
Keep each bullet under 12 words. Reply ONLY with the bullet list, nothing else.`;

    const result = await deps.routing.promptCheap(prompt, 8_000);
    if (!result.success || !result.text?.trim()) { return null; }
    return result.text.trim();
  } catch {
    return null;
  }
}

/** Shows a "here's what the Agent plans to do" confirmation card and waits for user input.
 *  Returns true (approved) or false (cancelled). Never throws. */
export async function confirmAgentRun(
  task: string,
  deps: MessageHandlerDeps,
  conversation: ChatMessage[],
  refresh: () => void,
  fromDiagnosis: boolean,
): Promise<AgentPermissionResult> {
  try {
    const { encodeClarifyToken } = await import('../../ui/panels/chat/chatPanelClarify.js');
    const { setPendingClarifyResolve } = await import('../../ui/panels/chat/chatPanelClarifyBridge.js');

    const summary = await buildAgentSummary(task, deps, fromDiagnosis);

    const bulletBlock = summary
      ? `\n\n${summary}\n\n`
      : '\n\n';

    const heading = fromDiagnosis
      ? `🤖 **The Agent is ready to start.** It will write code and run commands in your project.`
      : `🤖 **The Agent will verify the fix.** It will run commands to test the changes that were just applied.`;

    const q = {
      id: 'agent_permission',
      question: `${heading}${bulletBlock}Ready to proceed?`,
      options: [
        { label: '▶ Yes, run it' },
        { label: '✕ Cancel — show me the steps instead' },
      ],
    };

    conversation.push({ role: 'assistant', content: encodeClarifyToken([q]), timestamp: Date.now() });
    refresh();

    const answers = await new Promise<Record<string, string>>((resolve) => {
      setPendingClarifyResolve(resolve);
      // 10-minute timeout — auto-approve so a forgotten dialog never permanently blocks the pipeline
      setTimeout(() => resolve({ agent_permission: '▶ Yes, run it' }), 600_000);
    });

    const answer = (answers['agent_permission'] || '').trim();
    const approved = answer.startsWith('▶');
    return { approved, summary: summary ?? '' };
  } catch {
    // On any failure (clarify bridge unavailable etc.) — approve silently, never block the Agent
    return { approved: true, summary: '' };
  }
}
