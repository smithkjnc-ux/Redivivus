// [SCOPE] Extracted Guardian review validation and Auto-Save orchestration logic for AI messages
import * as vscode from 'vscode';
import type { RoutingService } from '../../../features/ai/data/routingService.js';
import type { UsageTracker } from '../../telemetry/data/usageTracker.js';
import type { ChatMessage } from '../ui/chatPanelHtml.js';
import { shouldAutoSave, extractAutoSaveTarget, autoSaveAndOpen } from '../../build/chatPanelAutoSave.js';

export async function runGuardianReviewOnCode(
  finalText: string,
  userText: string,
  isConvert: boolean,
  routing: RoutingService,
  usageTracker: UsageTracker | undefined,
  blueprintCtx: string
): Promise<string> {
  const hasCodeBlock = /```[a-z]*\n/i.test(finalText);
  if (!routing.isGuardianActive() || !isConvert || !hasCodeBlock) {
    return finalText;
  }
  const workerAI = routing.getAvailableAI().ai;
  const guardianTask = isConvert ? `Code conversion/transform task: ${userText}` : userText;
  const review = await routing.guardianReview(guardianTask, finalText, workerAI, blueprintCtx).catch(() => null);
  if (review && review.guardianAI && review.guardianAI !== 'none') {
    const reviewInput = guardianTask.length + finalText.length;
    const reviewOutput = review.correctedText ? review.correctedText.length : 50;
    const guardianTokens = Math.ceil((reviewInput + reviewOutput) / 4);
    const guardianCost = (guardianTokens / 1_000_000) * 0.30;
    await usageTracker?.recordUsage(guardianTokens, guardianCost, review.guardianAI, review.inputTokens, review.outputTokens);
  }
  let newText = finalText;
  if (review && !review.passed && review.correctedText) {
    newText = review.correctedText + `\n\n---\n*Guardian (${review.guardianAI}) reviewed and corrected this response.*`;
  }
  if (review?.scopeAlerts?.length) {
    newText += `\n\n---\n**Guardian also noticed (not applied -- say "also fix..." to address):**\n${review.scopeAlerts.map(a => `- ${a}`).join('\n')}`;
  }
  return newText;
}

export async function handleAutoSaveLogic(
  isConvert: boolean,
  finalText: string,
  userText: string,
  routing: RoutingService,
  answeredBy: string,
  estimatedTokens: number,
  conversation: ChatMessage[],
  refresh: () => void
) {
  if (!isConvert) return;

  let root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  // Don't auto-save into the projects container — land in an auto-created subfolder instead
  if (root) {
    const os = require('os') as typeof import('os');
    const path = require('path') as typeof import('path');
    const cfg = vscode.workspace.getConfiguration('redivivus').get<string>('projectsDirectory', '~/projects')!.replace('~', os.homedir());
    if (path.resolve(root) === path.resolve(cfg)) {
      const { lastAutoCreatedDir } = await import('../../build/chatPanelBuildAutoCreate.js');
      root = (lastAutoCreatedDir && require('fs').existsSync(lastAutoCreatedDir)) ? lastAutoCreatedDir : '';
    }
  }
  if (await shouldAutoSave(finalText, userText, routing)) {
    const target = extractAutoSaveTarget(finalText, userText, root);
    if (target) {
      const confirmation = await autoSaveAndOpen(target.code, target.filename, root, {
        model: answeredBy,
        tokens: estimatedTokens,
      });
      if (confirmation) {
        conversation.push({ role: 'assistant', content: confirmation, timestamp: Date.now() });
        refresh();
      }
    }
  }
}
