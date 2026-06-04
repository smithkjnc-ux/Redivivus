// [SCOPE] Post-build security scanner — scans built files for common vulnerabilities and warns
// the user in the chat panel. Does NOT block the build but flags issues prominently.
// Covers the top issues that separate vibe code from production code: secrets, injection, XSS.
import * as fs from 'fs';
import * as path from 'path';

export interface SecurityFinding {
  file: string;
  line: number;
  severity: 'critical' | 'warning';
  issue: string;
  snippet: string;
}

// ── Pattern library ──────────────────────────────────────────────────────────────────────────
const PATTERNS: Array<{ re: RegExp; severity: 'critical' | 'warning'; issue: string }> = [
  // Hardcoded secrets
  { re: /(?:api[_-]?key|apikey|secret|password|passwd|token|auth)['":\s=]+['"][A-Za-z0-9_\-./+=]{8,}/i, severity: 'critical', issue: 'Hardcoded secret/API key — use an environment variable instead' },
  { re: /sk-[A-Za-z0-9]{20,}/, severity: 'critical', issue: 'Hardcoded OpenAI API key (sk-...)' },
  { re: /ghp_[A-Za-z0-9]{30,}/, severity: 'critical', issue: 'Hardcoded GitHub personal access token (ghp_...)' },
  { re: /AKIA[A-Z0-9]{16}/, severity: 'critical', issue: 'Hardcoded AWS access key (AKIA...)' },
  // SQL injection — catch both + concatenation and template literals
  { re: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE).{0,80}['"`]\s*\+/i, severity: 'critical', issue: 'SQL string concatenation — use parameterized queries' },
  { re: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE).{0,120}\$\{/i, severity: 'critical', issue: 'SQL template literal with variable — use parameterized queries' },
  { re: /query\s*\(\s*[`'"]\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE)/i, severity: 'critical', issue: 'SQL query with raw string — use parameterized queries' },
  // XSS
  { re: /\.innerHTML\s*=\s*(?!['"`]<(?:div|span|p|h[1-6]|ul|li|table|tr|td|th|br)\b)/, severity: 'critical', issue: 'innerHTML assignment — use textContent or sanitize with DOMPurify' },
  { re: /document\.write\s*\(/, severity: 'warning', issue: 'document.write() is unsafe and deprecated' },
  // Unsafe execution
  { re: /\beval\s*\((?!['"`])/, severity: 'critical', issue: 'eval() with non-literal argument — code injection risk' },
  { re: /new\s+Function\s*\((?!['"`])/, severity: 'critical', issue: 'new Function() with dynamic argument — code injection risk' },
  // Silent error swallowing
  { re: /catch\s*\([^)]*\)\s*\{\s*\}/, severity: 'warning', issue: 'Empty catch block — errors are silently swallowed' },
  { re: /catch\s*\([^)]*\)\s*\{\s*\/\/[^\n]*\n\s*\}/, severity: 'warning', issue: 'Catch block with only a comment — error is still swallowed' },
  // Dangerous patterns
  { re: /setTimeout\s*\(\s*['"`]/, severity: 'warning', issue: 'setTimeout with string argument — use a function instead' },
  { re: /localStorage\.setItem\s*\([^,]+,\s*(?:password|token|secret|key)/i, severity: 'critical', issue: 'Storing sensitive data in localStorage without encryption' },
];

const SKIP_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.bin', '.lock']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.redivivus', 'dist', 'build', 'out', '__pycache__']);

function scanFile(filePath: string): SecurityFinding[] {
  const ext = path.extname(filePath).toLowerCase();
  if (SKIP_EXTENSIONS.has(ext)) return [];
  let content: string;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { return []; }
  const lines = content.split('\n');
  const findings: SecurityFinding[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment-only lines and import statements (secrets in imports are rare false positives)
    if (/^\s*(\/\/|#|\/\*)/.test(line) || /^\s*import\s/.test(line)) continue;
    for (const { re, severity, issue } of PATTERNS) {
      if (re.test(line)) {
        findings.push({
          file: filePath,
          line: i + 1,
          severity,
          issue,
          snippet: line.trim().slice(0, 100),
        });
        break; // one finding per line
      }
    }
  }
  return findings;
}

function scanDir(dir: string, findings: SecurityFinding[]): void {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    // [FIX] withFileTypes avoids a per-entry statSync. Symlinks report neither isDirectory nor
    // isFile here, so a dangling symlink (or symlink loop) is skipped instead of throwing and
    // aborting the entire scan (which left the project with zero findings reported).
    if (entry.isDirectory()) { scanDir(full, findings); }
    else if (entry.isFile()) { findings.push(...scanFile(full)); }
  }
}

/** Scan a project directory for security issues. Returns all findings. */
export function scanProject(root: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  scanDir(root, findings);
  return findings;
}

/** Format findings as a chat message. Returns empty string if no findings. */
export function formatSecurityReport(findings: SecurityFinding[], root: string): string {
  if (findings.length === 0) return '';
  const critical = findings.filter(f => f.severity === 'critical');
  const warnings  = findings.filter(f => f.severity === 'warning');
  const relPath = (f: SecurityFinding) => path.relative(root, f.file);

  let msg = `**[!] Security Scan: ${critical.length} critical, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}**\n\n`;

  if (critical.length > 0) {
    msg += `**Critical (fix before shipping):**\n`;
    for (const f of critical.slice(0, 5)) {
      msg += `- \`${relPath(f)}:${f.line}\` -- ${f.issue}\n  \`${f.snippet}\`\n`;
    }
    if (critical.length > 5) msg += `  ...and ${critical.length - 5} more.\n`;
    msg += '\n';
  }
  if (warnings.length > 0) {
    msg += `**Warnings:**\n`;
    for (const f of warnings.slice(0, 3)) {
      msg += `- \`${relPath(f)}:${f.line}\` -- ${f.issue}\n`;
    }
    if (warnings.length > 3) msg += `  ...and ${warnings.length - 3} more.\n`;
  }
  msg += '\nTell me which issue to fix and I will handle it.';
  return msg;
}
