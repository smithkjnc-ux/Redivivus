// [SCOPE] Plan Mode Interview — conversational 5 W's inline chat interview
// Triggered when user selects "Plan It Out". Runs entirely within the chat conversation.
// [WARN] This file uses `deps: any` to avoid circular imports with chatPanelMessages.ts.
// Helpers (followups, summary, task builder, blueprint save) -> chatPanelPlanInterviewHelpers.ts

import { generateFollowups, buildSummary, buildTaskFromAnswers, saveBlueprint, inferRemainingWs } from './chatPanelPlanInterviewHelpers';

export interface PlanInterviewState {
  step: number; // 1=what, 2=who, 3=where, 4=when, 5=why, 6=followups, 7=confirm, 8=done
  answers: Record<string, string>;
  followupQuestions: string[];
  followupAnswers: string[];
  followupIndex: number;
  originalTask: string;
  needsProjectName?: boolean; // true when waiting for name before creating project
  pendingTask?: string;
  pendingAnswers?: Record<string, string>;
  pendingAutoName?: string;
}

function deriveProjectName(what: string): string {
  return what
    .toLowerCase()
    .replace(/^(build|create|make|write|a|an|the)\s+/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'my-project';
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

  // Handle project name step — fires after confirm when no project is open
  if (interview.needsProjectName) {
    const autoName = interview.pendingAutoName || 'my-project';
    const isDefault = /^(yes|go|ok|sure|yeah|yep|proceed|continue|enter)$/i.test(answer) || answer.length <= 1;
    const name = isDefault ? autoName : answer.slice(0, 50).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || autoName;
    interview.needsProjectName = false;
    interview.step = 9;
    conversation.push({ role: 'assistant', content: `Creating **${name}** and starting the build...`, timestamp: Date.now() });
    refresh();
    if (deps.onNewProject) {
      const answers = { ...(interview.pendingAnswers || {}), _originalTask: interview.pendingTask || '' };
      await deps.onNewProject(name, answers);
    }
    return;
  }

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
      // [FIX] Use live workspace check — deps.redivivus.isInitialized() can be stale after project switches
      const wsRoot = require('vscode').workspace.workspaceFolders?.[0]?.uri.fsPath;
      const hasProject = !!(wsRoot && require('fs').existsSync(require('path').join(wsRoot, '.redivivus')));
      if (hasProject) {
        // Project open — save blueprint then build directly.
        // [FIX] skipComplex=true: plan interview replaces all gates (scope, vault, cost, blueprint checks).
        saveBlueprint(deps, interview.answers);
        conversation.push({ role: 'assistant', content: 'Perfect! Starting the build now...', timestamp: Date.now() });
        refresh();
        await handleBuildRequest(task, true);
        interview.step = 9;
      } else {
        // No project open — ask for name then create project in-chat (no modal)
        interview.needsProjectName = true;
        interview.pendingTask = task;
        interview.pendingAnswers = { ...interview.answers };
        const autoName = deriveProjectName(interview.answers.what || task);
        interview.pendingAutoName = autoName;
        conversation.push({
          role: 'assistant',
          content: `Almost done! What should I name this project? I'll use **${autoName}** if you just press Enter, or type something different.`,
          timestamp: Date.now(),
        });
        refresh();
      }
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

  // [RULE 18] After 'what' answered (step just became 2): AI infers obvious remaining W's so we skip them
  if (interview.step === 2 && deps.routing) {
    try {
      const inferred = await inferRemainingWs(interview.answers.what || '', deps.routing);
      if (Object.keys(inferred).length > 0) {
        Object.assign(interview.answers, inferred);
        const labels = Object.entries(inferred)
          .map(([k, v]) => `**${k.charAt(0).toUpperCase() + k.slice(1)}:** ${v}`)
          .join(' · ');
        (interview as any)._inferenceSummary = `I've pre-filled a few things: ${labels}.`;
      }
    } catch { /* best-effort — proceed without inference */ }
    // Skip past any pre-filled W's
    while (interview.step <= 5 && interview.answers[W_FIELDS[interview.step - 1]]) {
      interview.step++;
    }
  }

  if (interview.step >= 2 && interview.step <= 5) {
    const field = W_FIELDS[interview.step - 1];
    const prefix = (interview as any)._inferenceSummary ? `${(interview as any)._inferenceSummary}\n\n` : '';
    (interview as any)._inferenceSummary = '';
    conversation.push({ role: 'assistant', content: prefix + W_QUESTIONS[field], timestamp: Date.now() });
    refresh();
    return;
  }

  // If step jumped past 5 (all W's inferred), show inference note before followups/summary
  if (interview.step > 5 && (interview as any)._inferenceSummary) {
    const inferNote = (interview as any)._inferenceSummary;
    (interview as any)._inferenceSummary = '';
    conversation.push({ role: 'assistant', content: inferNote + '\n\nOne moment while I put this together...', timestamp: Date.now() });
    refresh();
  }

  if (interview.step === 6) {
    const followups = await generateFollowups(interview.answers, deps.routing);
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
