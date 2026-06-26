// [SCOPE] Chat send-message early-exit handlers: URL reading, web search, user memory, read-#N result.
// Extracted from chatPanelMsgSendMessage.ts (Rule 9 split). Returns true if message was handled.

import type { ChatMessage } from '../ui/chatPanelHtml.js';

/** Handle pasted URL + "read/use/check..." — reads the URL and posts summary. */
export async function handleUrlRead(
  userText: string,
  lowerText: string,
  conversation: ChatMessage[],
  refresh: () => void,
): Promise<boolean> {
  const { extractUrl, readUrl } = await import('../../../shared/vscode/application/webSearchService.js');
  const pastedUrl = extractUrl(userText);
  if (!pastedUrl || !/\b(read|use|look at|check|fetch|get|from|reference)\b/i.test(lowerText)) {
    return false;
  }
  conversation.push({ role: 'assistant', content: `Reading \`${pastedUrl}\`...`, timestamp: Date.now() });
  refresh();
  const page = await readUrl(pastedUrl);
  if (page) {
    const summary = page.text.slice(0, 4000);
    const truncNote = page.truncated ? '\n_(Page was large -- showing first portion)_' : '';
    conversation[conversation.length - 1].content =
      `**${page.title || pastedUrl}**\n\n${summary}${truncNote}`;
  } else {
    conversation[conversation.length - 1].content =
      'Could not read that URL. It may be blocked, require login, or be non-text content.';
  }
  refresh();
  return true;
}

/** Infer project context from conversation history to disambiguate web search queries. */
function inferProjectContext(conversation: ChatMessage[]): string {
  const recent = conversation.slice(-10).map(m => m.content.toLowerCase()).join(' ');
  // Game-related keywords
  if (/flappy|bird|game|canvas|phaser|pygame|unity|godot|score|level|player|sprite/i.test(recent)) {
    if (/flappy/i.test(recent)) {return 'Flappy Bird game';}
    if (/phaser|canvas.*game|html5 game/i.test(recent)) {return 'HTML5 canvas game';}
    return 'game development';
  }
  // Web app keywords
  if (/react|vue|angular|nextjs|nuxt|frontend|component/i.test(recent)) {return 'web app';}
  // API/backend keywords
  if (/api|backend|server|endpoint|rest|graphql/i.test(recent)) {return 'API backend';}
  return '';
}

/** Handle web search intent — searches DuckDuckGo and posts results. */
export async function handleWebSearch(
  userText: string,
  lowerText: string,
  conversation: ChatMessage[],
  refresh: () => void,
): Promise<boolean> {
  const { extractUrl, detectSearchIntent, searchWeb } = await import('../../../shared/vscode/application/webSearchService.js');
  const pastedUrl = extractUrl(userText);
  const rawQuery = detectSearchIntent(userText);
  if (!rawQuery || pastedUrl) { return false; }
  // [FIX] Disambiguate query with project context from conversation history
  const context = inferProjectContext(conversation);
  const searchQuery = context ? `${context}: ${rawQuery}` : rawQuery;
  conversation.push({ role: 'assistant', content: `Searching the web for "${searchQuery}"...`, timestamp: Date.now() });
  refresh();
  const results = await searchWeb(searchQuery);
  if (results.length > 0) {
    const formatted = results.map((r, i) =>
      `${i + 1}. **[${r.title}](${r.url})**\n   ${r.snippet}`).join('\n\n');
    conversation[conversation.length - 1].content =
      `**Web results for "${searchQuery}":**\n\n${formatted}\n\n_Say "read #1" to fetch the full page, or ask me to use these results in a build._`;
  } else {
    conversation[conversation.length - 1].content =
      `No results found for "${searchQuery}". Try rephrasing or check your internet connection.`;
  }
  refresh();
  return true;
}

/** Handle "remember that..." — stores user preference with 0 AI tokens. */
export async function handleRememberIntent(
  userText: string,
  conversation: ChatMessage[],
  refresh: () => void,
): Promise<boolean> {
  const { detectRememberIntent, rememberExplicit } = await import('../application/userMemoryService.js');
  const rememberText = detectRememberIntent(userText);
  if (!rememberText) { return false; }
  rememberExplicit(rememberText);
  conversation.push({
    role: 'assistant',
    content: `Got it -- I'll remember: **"${rememberText}"**\n\n_This preference will be used in all future builds across all projects._`,
    timestamp: Date.now(),
  });
  refresh();
  return true;
}

/** Handle "read #N" — fetches a specific URL from a prior web search result. */
export async function handleReadResult(
  lowerText: string,
  conversation: ChatMessage[],
  refresh: () => void,
): Promise<boolean> {
  const { readUrl } = await import('../../../shared/vscode/application/webSearchService.js');
  const readResultMatch = lowerText.match(/^read\s+#?(\d+)/);
  if (!readResultMatch) { return false; }
  const prevMsg = [...conversation].reverse().find(
    m => m.role === 'assistant' && m.content.includes('**Web results for'));
  if (!prevMsg) { return false; }
  const urlMatches = [...prevMsg.content.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)];
  const idx = parseInt(readResultMatch[1]) - 1;
  if (!urlMatches[idx]) { return false; }
  const targetUrl = urlMatches[idx][2];
  conversation.push({ role: 'assistant', content: `Reading \`${targetUrl}\`...`, timestamp: Date.now() });
  refresh();
  const page = await readUrl(targetUrl);
  if (page) {
    const truncNote = page.truncated ? '\n_(Page was large -- showing first portion)_' : '';
    conversation[conversation.length - 1].content =
      `**${page.title || targetUrl}**\n\n${page.text.slice(0, 4000)}${truncNote}`;
  } else {
    conversation[conversation.length - 1].content = 'Could not read that page.';
  }
  refresh();
  return true;
}
