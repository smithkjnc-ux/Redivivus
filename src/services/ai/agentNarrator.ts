// [SCOPE] Agent Narrator — deterministic documentary-style descriptions for ReAct loop tool calls.
// Zero AI tokens: all narration is generated from tool name + args context.
// Called by agentService.ts for each tool use in the loop.

/** Extracts the agent's own reasoning text (before any <tool_call> block). */
export function extractAgentThought(aiText: string): string {
  const toolCallIdx = aiText.indexOf('<tool_call>');
  const rawThought = toolCallIdx > 0 ? aiText.slice(0, toolCallIdx).trim() : '';
  if (!rawThought) { return ''; }
  // Strip markdown fences, "THOUGHT:", "REASONING:" prefixes the AI sometimes adds
  return rawThought
    .replace(/^(thought|reasoning|plan|action|thinking):\s*/im, '')
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(thought|action|reasoning|observation)\*\*:?\s*/gi, '')
    .trim();
}

/** Returns a rich, documentary-style narrator line for each tool invocation. */
export function narrateTool(toolName: string, args: Record<string, any>, iteration: number, maxIterations: number): string {
  const step = `_Step ${iteration} of up to ${maxIterations}_`;
  switch (toolName) {
    case 'read_file': {
      const fp = args.filePath || args.path || 'unknown file';
      const ext = fp.split('.').pop()?.toLowerCase() || '';
      const typeLabel: Record<string, string> = {
        ts: 'TypeScript source', js: 'JavaScript module', tsx: 'React component',
        json: 'config file', html: 'HTML template', css: 'stylesheet',
        py: 'Python script', md: 'documentation', sh: 'shell script',
      };
      const label = typeLabel[ext] || 'file';
      return `📖 ${step}\n\n**Reading** \`${fp}\` — examining the existing ${label} to understand the current state before making changes.`;
    }
    case 'write_file': {
      const fp = args.filePath || args.path || 'unknown file';
      const content = args.content || '';
      const lineCount = content.split('\n').length;
      const isNew = !content.includes('// [DONE]');
      const verb = isNew ? 'Creating' : 'Updating';
      const ext = fp.split('.').pop()?.toLowerCase() || '';
      // [CHASSIS] Show actual code in the chat — truncate at 30 lines for readability
      const previewLines = content.split('\n').slice(0, 30);
      const truncated = lineCount > 30 ? `\n... (${lineCount - 30} more lines)` : '';
      const codeBlock = '```' + ext + '\n' + previewLines.join('\n') + truncated + '\n```';
      return `✍️ ${step}\n\n**${verb}** \`${fp}\` — writing ${lineCount} lines:\n\n${codeBlock}`;
    }
    case 'run_command': {
      const cmd = args.command || args.cmd || '';
      const cmdLabel = describeCommand(cmd);
      return `⚡ ${step}\n\n**Running:** \`${cmd}\`\n${cmdLabel}`;
    }
    case 'list_dir': {
      const dir = args.path || args.directory || '.';
      return `📁 ${step}\n\n**Scanning** \`${dir}\` — mapping the directory structure to locate relevant files before acting.`;
    }
    case 'search_code': {
      const query = args.query || args.pattern || '';
      const scope = args.path || 'entire workspace';
      return `🔍 ${step}\n\n**Searching** for \`${query}\` in \`${scope}\` — locating existing code before rewriting or extending it.`;
    }
    case 'ask_user': {
      const q = args.question || '';
      return `💬 ${step}\n\n**Pausing for input** — the agent needs clarification:\n\n> ${q}`;
    }
    default: {
      const toolDesc = toolName.replace(/_/g, ' ');
      const argSummary = Object.keys(args).slice(0, 2).map(k => `${k}: \`${String(args[k]).slice(0, 60)}\``).join(', ');
      return `🔧 ${step}\n\n**Using** \`${toolName}\` (${toolDesc})${argSummary ? ` — ${argSummary}` : ''}.`;
    }
  }
}

/** Describes a terminal command in plain English. */
function describeCommand(cmd: string): string {
  if (!cmd) { return ''; }
  const c = cmd.trim().toLowerCase();
  if (c.startsWith('npm install') || c.startsWith('npm i ')) { return '_Installing project dependencies._'; }
  if (c.startsWith('npm run build') || c.startsWith('tsc')) { return '_Compiling TypeScript — verifying the code builds without errors._'; }
  if (c.startsWith('npm run') || c.startsWith('npx')) { return '_Running a project script._'; }
  if (c.startsWith('git')) { return '_Executing a version control operation._'; }
  if (c.startsWith('ls') || c.startsWith('find') || c.startsWith('dir')) { return '_Listing files to verify structure._'; }
  if (c.startsWith('cat') || c.startsWith('type ')) { return '_Reading a file via terminal._'; }
  if (c.startsWith('mkdir')) { return '_Creating a new directory._'; }
  if (c.startsWith('cp') || c.startsWith('copy')) { return '_Copying files._'; }
  if (c.startsWith('rm') || c.startsWith('del')) { return '_Removing files._'; }
  if (c.startsWith('node ') || c.startsWith('python')) { return '_Executing the built program to verify it runs._'; }
  if (c.startsWith('curl') || c.startsWith('wget')) { return '_Fetching a remote resource._'; }
  return '_Executing system command._';
}
