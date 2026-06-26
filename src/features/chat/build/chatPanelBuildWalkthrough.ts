// [SCOPE] Build Walkthrough Generator — AI-generated summary of what was built, architecture, and next steps
// Called after successful builds to provide a structured handoff to the user.

import type { RoutingService } from '../../../shared/ai/infrastructure/routingService.js';
import type { ChatMessage } from '../ui/chatPanelHtml.js';
import * as path from 'path';
import * as fs from 'fs';

/** Generate a walkthrough summary of the completed build */
export async function generateWalkthrough(
  task: string,
  builtFiles: string[],
  root: string,
  routing: RoutingService,
): Promise<string> {
  // Gather file info for context
  const fileDescriptions = builtFiles.map(f => {
    const absPath = path.isAbsolute(f) ? f : path.join(root, f);
    let lines = 0;
    try { lines = fs.readFileSync(absPath, 'utf-8').split('\n').length; } catch { /* ignore */ }
    return `- \`${f}\` (${lines} lines)`;
  }).join('\n');

  const prompt = buildWalkthroughPrompt(task, fileDescriptions, builtFiles.length);

  try {
    const res = await routing.prompt(prompt, 20_000);
    if (res.success && res.text) {
      return formatWalkthrough(res.text, task);
    }
  } catch { /* AI failed — use static fallback */ }

  return buildStaticWalkthrough(task, builtFiles);
}

/** Build the AI prompt for walkthrough generation */
function buildWalkthroughPrompt(task: string, fileDescriptions: string, fileCount: number): string {
  return `You just completed building a project. Generate a brief handoff summary.

TASK: "${task}"

FILES CREATED:
${fileDescriptions}

Write a concise markdown summary with these sections:
1. **Files Created** — one bullet per file with a short description of what it does
2. **Architecture** — 1-2 sentences on the technical approach
3. **What's Next** — 2-3 suggestions for improvements the user could ask for

Rules:
- Keep it under 15 lines total
- No code blocks
- Be specific to what was actually built
- Start with "## Build Complete"`;
}

/** Wrap AI-generated walkthrough in a consistent format */
function formatWalkthrough(aiText: string, task: string): string {
  const cleaned = aiText
    .replace(/```[a-z]*\n?/g, '')
    .replace(/```/g, '')
    .trim();
  return `\n---\n${cleaned}\n\n---\n*-- Redivivus Build Walkthrough*`;
}

/** Static fallback when AI is unavailable */
function buildStaticWalkthrough(task: string, builtFiles: string[]): string {
  const fileList = builtFiles.map(f => `- \`${f}\``).join('\n');
  return [
    `\n---`,
    `## Build Complete`,
    ``,
    `**Files Created:**`,
    fileList,
    ``,
    `**What's Next:** Describe any changes or additions and I'll modify the code.`,
    ``,
    `---`,
    `*-- Redivivus Build Walkthrough*`,
  ].join('\n');
}

/** Append walkthrough to conversation after build completes */
export async function appendWalkthroughToConversation(
  task: string,
  builtFiles: string[],
  root: string,
  routing: RoutingService,
  conversation: ChatMessage[],
  refresh: () => void,
): Promise<void> {
  const walkthrough = await generateWalkthrough(task, builtFiles, root, routing);
  conversation.push({ role: 'assistant', content: walkthrough, timestamp: Date.now() });
  refresh();
}
