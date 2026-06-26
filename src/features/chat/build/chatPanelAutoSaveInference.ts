// [SCOPE] Chat Panel Auto-Save Inference — detects if an AI response should trigger an auto-save
import type { RoutingService } from '../../../shared/ai/infrastructure/routingService.js';

// Minimum lines in a code block to qualify for auto-save
const MIN_AUTO_SAVE_LINES = 10;

/** Checks if the AI response has a single dominant code block worth auto-saving */
export async function shouldAutoSave(aiResponse: string, userMessage: string, routing: RoutingService): Promise<boolean> {
  // [WARN] Handle BOTH closed (```...```) and truncated (```... with no closing fence) code blocks.
  // AI responses often get truncated when hitting output token limits.
  const closedBlocks = aiResponse.match(/```\w*[^\S\r\n]*\r?\n[\s\S]*?```/g) || [];
  // Check for unclosed block: starts with ``` but never closes
  const hasUnclosedBlock = /```\w*[^\S\r\n]*\r?\n[\s\S]{100,}$/.test(aiResponse) && !aiResponse.trim().endsWith('```');
  const totalBlocks = closedBlocks.length + (hasUnclosedBlock ? 1 : 0);
  if (totalBlocks === 0) { return false; }

  let substantialCount = closedBlocks.filter(b => b.split('\n').length - 2 >= MIN_AUTO_SAVE_LINES).length;
  if (hasUnclosedBlock) {
    const unclosedContent = aiResponse.slice(aiResponse.lastIndexOf('```'));
    if (unclosedContent.split('\n').length >= MIN_AUTO_SAVE_LINES) { substantialCount++; }
  }

  // Fast-path: if the AI explicitly added a [SCOPE] tag, or outputted a massive file (>40 lines),
  // it's definitively writing a file, regardless of what the user's prompt literally said.
  const hasScopeTag = /\[SCOPE\]/.test(aiResponse);
  const hasMassiveBlock = closedBlocks.some(b => b.split('\n').length > 40) || 
    (hasUnclosedBlock && aiResponse.slice(aiResponse.lastIndexOf('```')).split('\n').length > 40);
  
  if ((hasScopeTag || hasMassiveBlock) && substantialCount > 0) {
    return true;
  }

  // [RULE 18] AI classifier decides whether the user asked to build/generate a file
  // Only used if the block is small and ambiguous
  try {
    const prompt = `User message: "${userMessage.slice(0, 200)}"\nDid the user ask to build, create, generate, modify, or update code/files? Reply with one word: yes or no`;
    const res = await routing.prompt(prompt, 12_000);
    const cleanText = (res?.text || '').replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (res.success && res.text && !cleanText.startsWith('yes')) { return false; }
  } catch {
    if (!/\b(build|create|make|generate|write|implement|code|produce|rewrite|rebuild)\b/i.test(userMessage)) { return false; }
  }

  return substantialCount > 0;
}
