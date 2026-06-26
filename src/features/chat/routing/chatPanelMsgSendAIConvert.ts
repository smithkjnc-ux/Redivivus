// [SCOPE] AI chat: chunked conversion handler for large source files.
// Returns null when source is small enough for a single API call (falls through to routing.prompt).

import type { RoutingService } from '../../../shared/ai/infrastructure/routingService.js';
import type { UsageTracker } from '../../telemetry/infrastructure/usageTracker.js';
import type { ChatMessage } from '../ui/chatPanelHtml.js';
import { findSourceFiles } from '../../../shared/ai/domain/chatPanelAI.js';
import { splitSourceIntoSections, chunkedGenerate } from '../build/chatPanelChunkedGen.js';

const CHUNKED_THRESHOLD = 300;

export interface ChunkedConvertResult {
  finalText: string;
  estimatedTokens: number;
  estimatedCost: number;
}

export async function runChunkedConvert(
  userText: string,
  wsRoot: string,
  routing: RoutingService,
  usageTracker: UsageTracker | undefined,
  conversation: ChatMessage[],
  refresh: () => void,
): Promise<ChunkedConvertResult | null> {
  const srcFiles = findSourceFiles(userText, wsRoot);
  const totalLines = srcFiles.reduce((sum, f) => sum + f.lineCount, 0);
  if (totalLines <= CHUNKED_THRESHOLD || srcFiles.length === 0) { return null; }

  const mainFile = srcFiles[0];
  const sections = splitSourceIntoSections(mainFile.content);
  const targetFormat = /\b(html|web|browser)\b/i.test(userText) ? 'HTML/JavaScript' : 'the target format';
  conversation.push({ role: 'assistant', content: `Large file detected (${totalLines} lines). Generating in ${sections.length} parts...`, timestamp: Date.now() });
  refresh();
  const genResult = await chunkedGenerate(routing, mainFile.content, sections, userText, targetFormat, (progress) => {
    conversation.push({ role: 'assistant', content: progress, timestamp: Date.now() });
    refresh();
  });
  const estimatedTokens = Math.ceil(genResult.text.length / 4);
  const estimatedCost = (estimatedTokens / 1_000_000) * 0.30;
  await usageTracker?.recordUsage(estimatedTokens, estimatedCost, routing.getAvailableAI().ai, genResult.inputTokens || undefined, genResult.outputTokens || undefined, 'qa');
  const lang = /\b(html|web|browser)\b/i.test(userText) ? 'html' : 'js';
  return { finalText: '```' + lang + '\n' + genResult.text + '\n```', estimatedTokens, estimatedCost };
}
