// [SCOPE] Built-in Tools for the Agentic Architecture.
// These tools are exposed to the Agent LLM so it can read/write files and run commands autonomously.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface AgentContext {
  root: string;
  task: string;
  log: (msg: string) => void;
  modifiedFiles: Set<string>;
  snapshotId?: string;
  routing?: any; // RoutingService instance
  blueprintContext?: string;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: string; // JSON schema or description of args
  execute: (args: any, context: AgentContext) => Promise<string>;
}

export const BUILT_IN_TOOLS: AgentTool[] = [
  {
    name: 'read_file',
    description: 'Reads the contents of a file in the workspace.',
    parameters: '{ "filePath": "string (relative path)" }',
    execute: async (args: any, ctx: AgentContext) => {
      const absPath = path.join(ctx.root, args.filePath);
      if (!fs.existsSync(absPath)) { return `Error: File ${args.filePath} does not exist.`; }
      try {
        const content = fs.readFileSync(absPath, 'utf8');
        return content;
      } catch (e: any) {
        return `Error reading file: ${e.message}`;
      }
    }
  },
  {
    name: 'write_file',
    description: 'Writes or overwrites a file in the workspace with new content. Use this to create new files or completely replace existing ones.',
    parameters: '{ "filePath": "string (relative path)", "content": "string (file content)" }',
    execute: async (args: any, ctx: AgentContext) => {
      const absPath = path.join(ctx.root, args.filePath);
      try {
        if (!ctx.snapshotId) {
          const { createSnapshot } = await import('../../core/build/chatPanelBuildWriter.js');
          ctx.snapshotId = createSnapshot(ctx.root, `Agent task: ${ctx.task.substring(0, 50)}`, args.filePath);
        }
        
        let contentToWrite = args.content || '';

        // [FIX] Strip markdown fences: AIs frequently wrap write_file content in ```lang\n...\n```.
        // extractCodeFromResponse handles closed/unclosed fences; is a no-op for fence-free content.
        if (contentToWrite.trimStart().startsWith('```')) {
          const { extractCodeFromResponse } = await import('../../core/build/chatPanelBuildInference.js');
          contentToWrite = extractCodeFromResponse(contentToWrite);
        }

        // [Redivivus] Guardian AI Oversight
        if (ctx.routing && ctx.routing.isGuardianActive()) {
          ctx.log(`🛡️ **Guardian AI** reviewing proposed write to \`${args.filePath}\`...`);
          try {
            const review = await ctx.routing.guardianReview(
              ctx.task,
              contentToWrite,
              'agent',
              ctx.blueprintContext || ''
            );
            if (review && !review.passed && review.correctedText) {
              const issues = review.issues && review.issues.length ? review.issues.join('; ') : 'Quality/correctness improvements';
              ctx.log(`⚠️ **Guardian AI** corrected proposed write to \`${args.filePath}\` (Issues: ${issues})`);
              
              // Extract the code block safely if it is wrapped in markdown formatting by the Guardian
              const { extractCodeFromResponse } = await import('../../core/build/chatPanelBuildInference.js');
              contentToWrite = extractCodeFromResponse(review.correctedText);
            } else {
              ctx.log(`🟢 **Guardian AI** approved proposed write to \`${args.filePath}\``);
            }
          } catch (e: any) {
            ctx.log(`⚠️ **Guardian AI** review skipped due to an error: ${e.message}`);
          }
        }

        const dir = path.dirname(absPath);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        fs.writeFileSync(absPath, contentToWrite, 'utf8');
        ctx.modifiedFiles.add(args.filePath);
        ctx.log(`✅ Wrote \`${args.filePath}\``);
        // [Redivivus] Live preview: open written file beside the chat immediately.
        try { const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath)); await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }); } catch { /* non-blocking */ }
        return `Successfully wrote to ${args.filePath}.`;
      } catch (e: any) {
        return `Error writing file: ${e.message}`;
      }
    }
  },
  {
    name: 'run_command',
    description: 'Executes a shell command in the project directory and returns the output (e.g. npm install, gcc).',
    parameters: '{ "command": "string (shell command)" }',
    execute: async (args: any, ctx: AgentContext) => {
      ctx.log(`🖥️ Running: \`${args.command}\``);
      try {
        const { stdout, stderr } = await execAsync(args.command, { cwd: ctx.root, timeout: 15000 });
        let result = '';
        if (stdout) {result += `STDOUT:\n${stdout}\n`;}
        if (stderr) {result += `STDERR:\n${stderr}\n`;}
        if (!result) {result = 'Command completed successfully with no output.';}
        return result;
      } catch (e: any) {
        if (e.killed && e.signal === 'SIGTERM') {
          return `Command timed out after 15 seconds and was killed.\nSTDOUT:\n${e.stdout || ''}\nSTDERR:\n${e.stderr || ''}\nIf you are trying to start a server or long-running process, you MUST run it in the background and detach output, e.g.: \`python3 -m http.server > server.log 2>&1 &\``;
        }
        return `Command failed:\nSTDOUT:\n${e.stdout || ''}\nSTDERR:\n${e.stderr || ''}\nERROR:\n${e.message}`;
      }
    }
  },
  {
    name: 'ask_user',
    description: 'Pauses the agent loop and asks the user for clarification or permission.',
    parameters: '{ "question": "string" }',
    execute: async (args: any, ctx: AgentContext) => {
      // This is a special tool. In the real agent loop, this might just yield the question back to chat.
      // For now, we return a system message indicating the loop should pause.
      return `_PAUSE_ASK_USER_${args.question}`;
    }
  },
  {
    name: 'list_dir',
    description: 'Lists all files and subdirectories in a directory.',
    parameters: '{ "dirPath": "string (relative path, e.g. \'.\' for root)" }',
    execute: async (args: any, ctx: AgentContext) => {
      const absPath = path.join(ctx.root, args.dirPath || '.');
      if (!fs.existsSync(absPath)) { return `Error: Directory ${args.dirPath} does not exist.`; }
      try {
        const files = fs.readdirSync(absPath, { withFileTypes: true });
        const list = files.map(f => `${f.isDirectory() ? '[DIR]' : '[FILE]'} ${f.name}`).join('\n');
        return list || 'Directory is empty.';
      } catch (e: any) {
        return `Error listing directory: ${e.message}`;
      }
    }
  },
  {
    name: 'search_web',
    description: 'Searches the web and returns top search results. Use this to find documentation, APIs, or solutions.',
    parameters: '{ "query": "string" }',
    execute: async (args: any, ctx: AgentContext) => {
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
    execute: async (args: any, ctx: AgentContext) => {
      ctx.log(`📄 Reading webpage: \`${args.url}\``);
      try {
        const res = await fetch(args.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const html = await res.text();
        let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                       .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                       .replace(/<[^>]+>/g, ' ')
                       .replace(/&nbsp;/g, ' ')
                       .replace(/&lt;/g, '<')
                       .replace(/&gt;/g, '>')
                       .replace(/&amp;/g, '&')
                       .replace(/&quot;/g, '"')
                       .replace(/&#39;/g, "'")
                       .replace(/\s+/g, ' ')
                       .trim();
        return text.substring(0, 15000); // Truncate to save tokens
      } catch (e: any) {
        return `Error reading URL: ${e.message}`;
      }
    }
  },
  {
    name: 'search_code',
    description: 'Searches the entire workspace for a specific keyword or regex pattern.',
    parameters: '{ "query": "string (keyword or regex)" }',
    execute: async (args: any, ctx: AgentContext) => {
      ctx.log(`🔍 Searching codebase for: \`${args.query}\``);
      try {
        const { stdout } = await execAsync(`grep -rnI "${args.query.replace(/"/g, '\\"')}" . | head -n 50`, { cwd: ctx.root });
        if (!stdout) { return 'No results found.'; }
        return stdout;
      } catch (e: any) {
        if (e.code === 1) {return 'No results found.';}
        return `Error searching codebase: ${e.message}`;
      }
    }
  }
];

export function getToolInstructions(): string {
  return BUILT_IN_TOOLS.map(t => 
    `- **${t.name}**: ${t.description}\n  Args: ${t.parameters}`
  ).join('\n\n');
}
