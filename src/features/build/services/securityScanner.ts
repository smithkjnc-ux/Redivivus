// [SCOPE] Post-build security scanner — scans built files for common safety problems and explains them
// to the user in PLAIN ENGLISH (Redivivus serves non-technical builders). Does NOT block the build.
// [WARN] Rule 18: this is mechanical pattern detection, not language understanding. To avoid crying
// wolf, context-dependent patterns (innerHTML) only flag when genuinely untrusted data is in play —
// a hardcoded "GAME OVER" string is never a vulnerability. Mirrors the backend Guardian fix (220af8f).
import * as fs from 'fs';
import * as path from 'path';

export interface SecurityFinding {
  file: string;
  line: number;
  severity: 'critical' | 'warning';
  issue: string;   // plain-English: what it is + why it matters, in everyday words
}

// Genuinely untrusted input — data a stranger could control. Used to decide whether dynamic innerHTML
// is actually risky. Note: localStorage/sessionStorage are intentionally EXCLUDED — a game saving its
// own high score is not attacker input, and including them produced false alarms on self-contained apps.
const UNTRUSTED_INPUT = /fetch\s*\(|\.json\s*\(\)|location\.(?:href|search|hash)|document\.cookie|URLSearchParams|FormData|\.value\b|\bprompt\s*\(/;

// ── Pattern library (plain-English messages) ─────────────────────────────────────────────────────
// innerHTML is handled separately below (it needs context), so it is NOT in this list.
const PATTERNS: Array<{ re: RegExp; severity: 'critical' | 'warning'; issue: string }> = [
  // Hardcoded secrets
  { re: /(?:api[_-]?key|apikey|secret|password|passwd|token|auth)['":\s=]+['"][A-Za-z0-9_\-./+=]{8,}/i, severity: 'critical', issue: 'A password or secret key is written straight into the code. Anyone who sees this file could use it. Keep secrets in a separate settings file instead of in the code.' },
  { re: /sk-[A-Za-z0-9]{20,}/, severity: 'critical', issue: 'Your OpenAI key is written into the code. If this code is ever shared, someone could run up charges on your account. Move it into a separate settings file.' },
  { re: /ghp_[A-Za-z0-9]{30,}/, severity: 'critical', issue: 'A GitHub access token is sitting in the code. Anyone with this file could get into your GitHub account. Store it separately, not in the code.' },
  { re: /AKIA[A-Z0-9]{16}/, severity: 'critical', issue: 'An Amazon (AWS) key is written into the code. Leaked cloud keys can cost real money fast. Keep it out of the file.' },
  // SQL injection
  { re: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE).{0,80}['"`]\s*\+/i, severity: 'critical', issue: 'This builds a database request by gluing text together. A sneaky user could slip extra commands into it. Use the safe "parameters" method so that cannot happen.' },
  { re: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE).{0,120}\$\{/i, severity: 'critical', issue: 'This database request drops a value straight into the command. That is a classic way people break into databases. Use safe query parameters instead.' },
  { re: /query\s*\(\s*[`'"]\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE)/i, severity: 'critical', issue: 'This runs a database command built from raw text. Use safe parameters so a user cannot change what the command does.' },
  { re: /document\.write\s*\(/, severity: 'warning', issue: 'This uses document.write(), an old way to add content to a page that can cause odd behavior. Modern code adds content a safer way.' },
  // Unsafe execution
  { re: /\beval\s*\((?!['"`])/, severity: 'critical', issue: 'eval() runs text as if it were live code. If any of that text comes from outside your app, it is a serious risk. There is almost always a safer way to do this.' },
  { re: /new\s+Function\s*\((?!['"`])/, severity: 'critical', issue: 'This turns text into runnable code on the fly. If the text is not fully under your control, it is risky. Avoid building code out of text.' },
  // Silent error swallowing
  { re: /catch\s*\([^)]*\)\s*\{\s*\}/, severity: 'warning', issue: 'If something goes wrong here, the error is silently thrown away — you would never know it broke. At least print the error so problems are visible.' },
  { re: /catch\s*\([^)]*\)\s*\{\s*\/\/[^\n]*\n\s*\}/, severity: 'warning', issue: 'Errors here are caught but then ignored. You will not find out when something fails. Log the error instead so you can see it.' },
  // Dangerous patterns
  { re: /setTimeout\s*\(\s*['"`]/, severity: 'warning', issue: 'This runs a piece of text as code on a timer, which is risky and slow. Pass it a real function instead of text.' },
  { re: /localStorage\.setItem\s*\([^,]+,\s*(?:password|token|secret|key)/i, severity: 'critical', issue: 'A password or key is being saved in the browser’s storage, which is not protected. Anyone using the device could read it. Avoid storing secrets there.' },
];

const INNERHTML_ISSUE = 'This page takes data from outside (like what a user typed, or something it downloaded) and drops it onto the page as live HTML. A bad actor could hide harmful code inside that data. Show it as plain text, or clean it up first.';

const SKIP_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.bin', '.lock']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.redivivus', 'dist', 'build', 'out', '__pycache__']);

// Decide whether an innerHTML assignment is actually risky. A pure hardcoded string ("<h1>GAME OVER</h1>")
// is always safe — only changing data (a variable, a `${...}` insert, or glued-together text) can carry an
// attack, and only when the file actually reads untrusted input.
function innerHtmlIsRisky(line: string, fileHasUntrustedInput: boolean): boolean {
  if (!fileHasUntrustedInput) return false;
  const rhs = (line.split(/\.innerHTML\s*\+?=\s*/)[1] || '').trim();
  if (!rhs) return false;
  const startsWithQuote = /^['"`]/.test(rhs);
  const hasInsert = rhs.includes('${');                       // template insert, e.g. `${name}`
  const hasConcat = /['"`]\s*\+|\+\s*[A-Za-z_$(]/.test(rhs);  // glued text, e.g. '<p>' + name
  const isDynamic = !startsWithQuote || hasInsert || hasConcat;
  return isDynamic;
}

function scanFile(filePath: string): SecurityFinding[] {
  const ext = path.extname(filePath).toLowerCase();
  if (SKIP_EXTENSIONS.has(ext)) return [];
  let content: string;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { return []; }
  const fileHasUntrustedInput = UNTRUSTED_INPUT.test(content);
  const lines = content.split('\n');
  const findings: SecurityFinding[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment-only lines and import statements (rare false positives)
    if (/^\s*(\/\/|#|\/\*)/.test(line) || /^\s*import\s/.test(line)) continue;

    // innerHTML — context-aware: a hardcoded string is fine; only flag dynamic data in a file that
    // reads untrusted input. This is what stopped the false "3 critical" on the Tetris GAME OVER text.
    if (/\.innerHTML\s*\+?=/.test(line)) {
      if (innerHtmlIsRisky(line, fileHasUntrustedInput)) {
        findings.push({ file: filePath, line: i + 1, severity: 'critical', issue: INNERHTML_ISSUE });
      }
      continue; // innerHTML lines are fully handled here
    }

    for (const { re, severity, issue } of PATTERNS) {
      if (re.test(line)) {
        findings.push({ file: filePath, line: i + 1, severity, issue });
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
    // [WARN] withFileTypes avoids a per-entry statSync. A dangling symlink reports neither directory
    // nor file here, so it is skipped instead of throwing and aborting the whole scan.
    if (entry.isDirectory()) { scanDir(full, findings); }
    else if (entry.isFile()) { findings.push(...scanFile(full)); }
  }
}

/** Scan a project directory for safety problems. Returns all findings. */
export function scanProject(root: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  scanDir(root, findings);
  return findings;
}

/** Format findings as a plain-English chat message. Returns empty string if nothing was found. */
export function formatSecurityReport(findings: SecurityFinding[], root: string): string {
  if (findings.length === 0) return '';
  const critical = findings.filter(f => f.severity === 'critical');
  const warnings = findings.filter(f => f.severity === 'warning');
  const relPath = (f: SecurityFinding) => path.relative(root, f.file);

  let msg = `**Safety check**\nI looked over your code for common safety problems. Here is what I found:\n\n`;

  if (critical.length > 0) {
    msg += `**Worth fixing before you share this (${critical.length}):**\n`;
    for (const f of critical.slice(0, 5)) {
      msg += `- In \`${relPath(f)}\`, line ${f.line}: ${f.issue}\n`;
    }
    if (critical.length > 5) msg += `- ...and ${critical.length - 5} more like these.\n`;
    msg += '\n';
  }
  if (warnings.length > 0) {
    msg += `**Minor — good to tidy up, not urgent (${warnings.length}):**\n`;
    for (const f of warnings.slice(0, 3)) {
      msg += `- In \`${relPath(f)}\`, line ${f.line}: ${f.issue}\n`;
    }
    if (warnings.length > 3) msg += `- ...and ${warnings.length - 3} more.\n`;
    msg += '\n';
  }
  msg += `Want me to fix any of these? Tell me which one and I will handle it — or if you are not sure what one means, just ask and I will explain it in plain terms.`;
  return msg;
}
