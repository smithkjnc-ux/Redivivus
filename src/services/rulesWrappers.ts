// [SCOPE] Rules AI wrappers — wraps rules content with AI-specific instructions for Claude and Gemini
// Called by rulesService. No file writing or rule content generation logic here.

export function wrapForClaude(rules: string, projectName: string): string {
  return `# CLAUDE.md — ${projectName}

This file instructs Claude Code how to work with this project.

${rules}

## Additional Claude-Specific Instructions

- Use /compact every 2 hours during long sessions
- Use /clear before starting major new features
- Read .redivivus/work_log.md at the start of every session
- When done, update [NEXT] tags with where you stopped
`;
}

export function wrapForGemini(rules: string, projectName: string): string {
  return `# GEMINI.md — ${projectName}

This file instructs Gemini Code Assist how to work with this project.

${rules}

## Additional Gemini-Specific Instructions

- Read .redivivus/work_log.md at session start for context
- Follow [SCOPE] tags strictly — don't expand file responsibilities
- When modifying Python, use # comments ONLY
- Update annotations after every change
`;
}
