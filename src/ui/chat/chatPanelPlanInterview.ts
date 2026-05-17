// [SCOPE] Plan Mode Interview — conversational 5 W's inline chat interview
// Triggered when user selects "Plan It Out". Runs entirely within the chat conversation.
// [WARN] This file uses `deps: any` to avoid circular imports with chatPanelMessages.ts.
// Helpers (followups, summary, task builder, blueprint save) -> chatPanelPlanInterviewHelpers.ts

import { generateFollowups, buildSummary, buildTaskFromAnswers, saveBlueprint } from './chatPanelPlanInterviewHelpers.js';

export interface PlanInterviewState {
  step: number; // 1=what, 2=who, 3=where, 4=when, 5=why, 6=followups, 7=confirm, 8=done
  answers: Record<string, string>;
  followupQuestions: string[];
  followupAnswers: string[];
  followupIndex: number;
  originalTask: string;
}

const W_FIELDS = ['what', 'who', 'where', 'when', 'why'] as const;

const W_QUESTIONS: Record<string, string> = {
  what:  "First -- what are you trying to build? A website, a game, an app, a tool? Just describe it in your own words, even if it's rough.",
  who:   "Great! Who's going to use this? Just yourself? A team? Customers? The more specific, the better I can tailor it.",
  where: "Where should this run? Web browser, desktop app, mobile phone, CLI, server? Or multiple places?",
  when:  "When do you need this working? Is there a hard deadline, or is it a 'whenever it's ready' kind of thing?",
  why:   "Last W -- why are you building this? What problem does it solve that nothing else solves well?",
};

/** Starts the plan interview by initializing state and posting the welcome + first question. */
export async function startPlanInterview(state: any): Promise<void> {
  state.planInterview = {
    step: 1, answers: {}, followupQuestions: [], followupAnswers: [], followupIndex: 0, originalTask: '',
  };
  state.conversation.push({
    role: 'assistant',
    content: "Let's plan your project! I'll walk you through a few questions so I understand exactly what you need.\n\n" + W_QUESTIONS.what,
    timestamp: Date.now(),
  });
}

/** Processes a user message as an interview answer and advances the conversation. */
export async function handlePlanInterviewAnswer(msg: any, deps: any): Promise<void> {
  const answer = msg.text?.trim();
  if (!answer) { return; }
  const interview = deps.planInterview as PlanInterviewState | undefined;
  if (!interview) { return; }
  const { conversation, refresh, handleBuildRequest } = deps;

  const lastMsg = conversation[conversation.length - 1];
  if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== answer) {
    conversation.push({ role: 'user', content: answer, timestamp: Date.now() });
  }
  refresh();

  if (interview.step >= 1 && interview.step <= 5) {
    const field = W_FIELDS[interview.step - 1];
    interview.answers[field] = answer;
  } else if (interview.step === 6) {
    interview.followupAnswers[interview.followupIndex] = answer;
    interview.followupIndex++;
  } else if (interview.step === 7) {
    const lower = answer.toLowerCase();
    if (/(^|\s)(yes|go|build it|let'?s go|start|proceed|do it)(\s|$)/.test(lower)) {
      interview.step = 8;
      const task = buildTaskFromAnswers(interview.answers, interview.followupAnswers, interview.followupQuestions);
      interview.originalTask = task;
      saveBlueprint(deps, interview.answers);
      conversation.push({ role: 'assistant', content: 'Perfect! Starting the build now...', timestamp: Date.now() });
      refresh();
      await handleBuildRequest(task);
      interview.step = 9;
      return;
    }
    conversation.push({
      role: 'assistant',
      content: "No problem! Just say **yes** or **go** when you're ready to start building. Or tell me what you'd like to change.",
      timestamp: Date.now(),
    });
    refresh();
    return;
  }

  interview.step++;

  if (interview.step >= 2 && interview.step <= 5) {
    const field = W_FIELDS[interview.step - 1];
    conversation.push({ role: 'assistant', content: W_QUESTIONS[field], timestamp: Date.now() });
    refresh();
    return;
  }

  if (interview.step === 6) {
    const followups = generateFollowups(interview.answers);
    if (followups.length > 0) {
      interview.followupQuestions = followups;
      interview.followupIndex = 0;
      conversation.push({ role: 'assistant', content: followups[0], timestamp: Date.now() });
      refresh();
      return;
    }
    interview.step = 7;
  }

  if (interview.step === 7) {
    const summary = buildSummary(interview.answers, interview.followupAnswers, interview.followupQuestions);
    conversation.push({
      role: 'assistant',
      content: `Here's what I'm going to build for you:\n\n${summary}\n\nReady to go? Just say **yes** or **go** to start building.`,
      timestamp: Date.now(),
    });
    refresh();
  }
}
