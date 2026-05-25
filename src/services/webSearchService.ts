// [SCOPE] Web Search + URL Reading Service -- fetches web pages and searches DuckDuckGo for docs/APIs.
// Used by the chat panel when user asks "look up X", "search for Y", or pastes a URL.
// [WARN] All network calls wrapped in try/catch with timeout. Never blocks builds on failure.

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebPageContent {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
}

const USER_AGENT = 'Redivivus-VSCode-Extension/1.0 (AI Coding Assistant)';
const DEFAULT_TIMEOUT = 10_000;
const MAX_PAGE_CHARS = 12_000; // Cap page content to fit in AI context window

/**
 * Search the web using DuckDuckGo HTML (no API key required).
 * Returns up to maxResults snippets with title, URL, and description.
 */
export async function searchWeb(query: string, maxResults = 5): Promise<WebSearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) { return []; }
    const html = await res.text();
    return parseDuckDuckGoResults(html, maxResults);
  } catch {
    return [];
  }
}

/**
 * Fetch a URL and extract readable text content (strips HTML tags).
 * Caps at MAX_PAGE_CHARS to avoid blowing up AI context.
 */
export async function readUrl(url: string): Promise<WebPageContent | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) { return null; }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/json')) {
      return null; // Skip binary content
    }
    const raw = await res.text();
    const title = extractTitle(raw);
    const text = stripHtml(raw);
    const truncated = text.length > MAX_PAGE_CHARS;
    return { url, title, text: text.slice(0, MAX_PAGE_CHARS), truncated };
  } catch {
    return null;
  }
}

/**
 * Detect if user message contains a URL to read.
 * Returns the first http/https URL found, or null.
 */
export function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"')\]]+/);
  return match ? match[0] : null;
}

/**
 * Detect if user message is a web search request.
 * Returns the search query if detected, or null.
 */
export function detectSearchIntent(text: string): string | null {
  const t = text.toLowerCase().trim();
  // Direct search patterns
  const patterns = [
    /^(?:search|look up|google|find|lookup)\s+(?:for\s+)?(.+)/i,
    /^(?:what is|what are|how to|how do i)\s+(.+?)(?:\s+in\s+\w+)?$/i,
    /^(?:show me|find me)\s+(?:the\s+)?(?:docs?|documentation|api|reference)\s+(?:for\s+)?(.+)/i,
    /^(?:docs?|documentation|api|reference)\s+(?:for\s+)?(.+)/i,
  ];
  for (const pat of patterns) {
    const m = t.match(pat);
    if (m) { return m[1].trim(); }
  }
  // If it contains "docs" or "documentation" with a library/framework name
  if (/\b(?:docs?|documentation|api reference|readme)\b/i.test(t) && t.length < 100) {
    return t;
  }
  return null;
}

// --- Internal helpers ---

function parseDuckDuckGoResults(html: string, max: number): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  // DuckDuckGo HTML results are in <div class="result"> blocks
  const resultBlocks = html.split(/class="result\s/);
  for (let i = 1; i < resultBlocks.length && results.length < max; i++) {
    const block = resultBlocks[i];
    // Extract URL from the first <a> tag
    const urlMatch = block.match(/href="([^"]+)"/);
    if (!urlMatch) { continue; }
    let resultUrl = urlMatch[1];
    // DuckDuckGo wraps URLs in a redirect
    const uddg = resultUrl.match(/uddg=([^&]+)/);
    if (uddg) { resultUrl = decodeURIComponent(uddg[1]); }
    // Skip DuckDuckGo internal links
    if (resultUrl.includes('duckduckgo.com')) { continue; }
    // Extract title
    const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    const title = titleMatch ? stripHtml(titleMatch[1]).trim() : resultUrl;
    // Extract snippet
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:td|div|span)>/);
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]).trim() : '';
    if (title && resultUrl.startsWith('http')) {
      results.push({ title, url: resultUrl, snippet });
    }
  }
  return results;
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripHtml(m[1]).trim().slice(0, 200) : '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
