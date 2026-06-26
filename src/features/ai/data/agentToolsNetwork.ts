// [SCOPE] Network/search agent tools — search_web, read_url, search_code.
// Extracted from agentTools.ts (Rule 9 split).

import { exec } from 'child_process';
import { promisify } from 'util';
import type { AgentTool } from './agentTools.js';

const execAsync = promisify(exec);

export const NETWORK_TOOLS: AgentTool[] = [
  {
    name: 'search_web',
    description: 'Searches the web and returns top search results. Use this to find documentation, APIs, or solutions.',
    parameters: '{ "query": "string" }',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] },
    execute: async (args: any, ctx: any) => {
      ctx.log(`🌐 Searching the web for: \`${args.query}\``);
      try {
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const html = await res.text();
        const results = [];
        const regex = /<a class="result__snippet[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        let match;
        while ((match = regex.exec(html)) !== null && results.length < 5) {
          let url = match[1];
          const uddgMatch = url.match(/uddg=([^&]+)/);
          if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);
          else if (url.startsWith('//')) url = 'https:' + url;
          const snippet = match[2].replace(/<[^>]+>/g, '').trim();
          results.push(`URL: ${url}\nSnippet: ${snippet}`);
        }
        return results.length > 0 ? results.join('\n\n') : 'No results found.';
      } catch (e: any) {
        return `Error searching web: ${e.message}`;
      }
    }
  },
  {
    name: 'read_url',
    description: 'Reads and extracts text content from a web page URL. Use this to read documentation after searching.',
    parameters: '{ "url": "string" }',
    inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'URL to fetch and extract text from' } }, required: ['url'] },
    execute: async (args: any, ctx: any) => {
      ctx.log(`📄 Reading webpage: \`${args.url}\``);
      try {
        const res = await fetch(args.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
        const html = await res.text();
        const text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
        return text.substring(0, 15000);
      } catch (e: any) {
        return `Error reading URL: ${e.message}`;
      }
    }
  },
  {
    name: 'search_code',
    description: 'Searches the entire workspace for a specific keyword or regex pattern.',
    parameters: '{ "query": "string (keyword or regex)" }',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Keyword or regex pattern to search for in the workspace' } }, required: ['query'] },
    execute: async (args: any, ctx: any) => {
      ctx.log(`🔍 Searching codebase for: \`${args.query}\``);
      try {
        const { stdout } = await execAsync(`grep -rnI "${args.query.replace(/"/g, '\\"')}" . | head -n 50`, { cwd: ctx.root });
        if (!stdout) { return 'No results found.'; }
        return stdout;
      } catch (e: any) {
        if (e.code === 1) { return 'No results found.'; }
        return `Error searching codebase: ${e.message}`;
      }
    }
  },
];
