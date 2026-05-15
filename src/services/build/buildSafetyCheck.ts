// [SCOPE] Pre-build safety check — scores a build request for security and complexity risks before AI writes code
// Called before every build. Returns a risk report. Never blocks — only advises.

export interface SafetyFlag {
  level: 'warn' | 'block';
  code: string;
  message: string;
  suggestion: string;
}

export interface SafetyReport {
  safe: boolean;         // true = proceed, false = blocked (only for hard blocks)
  score: number;         // 0 (safe) to 100 (very risky)
  flags: SafetyFlag[];
  summary: string;
}

// [WARN] Keep rules minimal and fast — this runs synchronously before every build
const RULES: Array<{ pattern: RegExp; level: 'warn' | 'block'; code: string; message: string; suggestion: string }> = [
  // Hard security blocks
  { pattern: /rm\s+-rf|drop\s+table|truncate\s+table|delete\s+from\s+\w+\s*;?\s*$/i, level: 'block', code: 'DESTRUCTIVE_OP', message: 'Request contains potentially destructive operations (rm -rf, DROP TABLE, etc.)', suggestion: 'Add explicit WHERE clauses or confirmation guards before destructive operations.' },
  { pattern: /eval\s*\(|exec\s*\(|__import__\s*\(|subprocess\.call|os\.system/i, level: 'block', code: 'CODE_INJECTION', message: 'Request may generate code that executes arbitrary strings (eval, exec, subprocess)', suggestion: 'Use parameterised functions instead of dynamic code execution.' },
  { pattern: /password\s*=\s*['"][^'"]{3,}['"]|api.?key\s*=\s*['"][^'"]{6,}['"]/i, level: 'block', code: 'HARDCODED_SECRET', message: 'Request appears to hardcode a password or API key in source code', suggestion: 'Use environment variables (.env) or a secrets manager. Never hardcode secrets.' },

  // Security warnings
  { pattern: /no\s+auth|without\s+auth|skip\s+auth|bypass\s+login|no\s+login|unauthenticated/i, level: 'warn', code: 'NO_AUTH', message: 'Request explicitly skips authentication', suggestion: 'Even for demos, add at minimum a basic token check so the pattern is set correctly.' },
  { pattern: /admin\s+panel|admin\s+route|\/admin/i, level: 'warn', code: 'ADMIN_EXPOSURE', message: 'Admin panel or route — make sure it requires strong authentication', suggestion: 'Require session + role check. Never expose admin routes without auth.' },
  { pattern: /cors\s*\(\s*\*|allow.?origin.*\*/i, level: 'warn', code: 'OPEN_CORS', message: 'Open CORS (all origins) — risky in production', suggestion: 'Whitelist specific origins unless this is a truly public API.' },
  { pattern: /innerHTML\s*=|\.html\s*\(.*\$\{|dangerouslySetInnerHTML/i, level: 'warn', code: 'XSS_RISK', message: 'Dynamic HTML injection detected — potential XSS risk', suggestion: 'Use textContent or a sanitisation library instead of innerHTML with user data.' },
  { pattern: /sql.*\$\{|query.*\+.*req\.|query.*\+.*input/i, level: 'warn', code: 'SQL_INJECTION', message: 'Possible SQL injection — string concatenation in query', suggestion: 'Use parameterised queries or an ORM.' },

  // Complexity warnings
  { pattern: /everything|complete\s+app|full\s+stack|entire\s+project|all\s+features/i, level: 'warn', code: 'SCOPE_CREEP', message: 'Very broad scope detected — this may produce a large, hard-to-review result', suggestion: 'Break into smaller builds: start with the data model, then routes, then UI.' },
  { pattern: /global\s+variable|window\.\w+\s*=|document\.\w+\s*=/i, level: 'warn', code: 'GLOBAL_STATE', message: 'Global state usage — can cause subtle bugs in larger apps', suggestion: 'Pass data as parameters or use a proper state management pattern.' },
];

/** Runs all safety rules against the task string. Fast — no AI, no async. */
export function checkBuildSafety(task: string): SafetyReport {
  const flags: SafetyFlag[] = [];
  for (const rule of RULES) {
    if (rule.pattern.test(task)) {
      flags.push({ level: rule.level, code: rule.code, message: rule.message, suggestion: rule.suggestion });
    }
  }

  const blocks = flags.filter(f => f.level === 'block');
  const warns = flags.filter(f => f.level === 'warn');
  const score = Math.min(100, blocks.length * 40 + warns.length * 15);
  const safe = blocks.length === 0;

  let summary = '';
  if (blocks.length > 0) {
    summary = `🚫 ${blocks.length} safety issue${blocks.length > 1 ? 's' : ''} found — please review before building.`;
  } else if (warns.length > 0) {
    summary = `⚠️ ${warns.length} thing${warns.length > 1 ? 's' : ''} to watch — build can proceed but review the suggestions.`;
  } else {
    summary = '✅ Looks clean — no obvious security or complexity issues.';
  }

  return { safe, score, flags, summary };
}

/** Formats a SafetyReport into a human-readable chat message block. */
export function formatSafetyReport(report: SafetyReport): string {
  if (report.flags.length === 0) return '';
  const lines = [`**🛡️ Pre-Build Safety Check** — Score: ${report.score}/100\n${report.summary}\n`];
  for (const f of report.flags) {
    const icon = f.level === 'block' ? '🚫' : '⚠️';
    lines.push(`${icon} **${f.code}:** ${f.message}\n   → ${f.suggestion}`);
  }
  return lines.join('\n');
}
