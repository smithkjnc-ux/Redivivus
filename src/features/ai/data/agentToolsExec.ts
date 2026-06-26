// [SCOPE] Streamed shell execution for the agent's run_command tool. Replaces a fixed 15s exec()+1MB buffer
// (which killed real installs/builds and FALSE-failed on any command printing >1MB) with spawn() that
// STREAMS output — no buffer cap — and times out on INACTIVITY, not wall-clock: a command that's actively
// printing keeps running; a genuinely hung one is killed by an idle timeout, with an absolute ceiling as a
// backstop. Kills the whole process GROUP so build sub-processes don't orphan. No VS Code deps → testable.

import { spawn } from 'child_process';

export interface ShellResult { stdout: string; stderr: string; code: number | null; timedOut: 'idle' | 'hard' | null; }
export interface ShellOpts { idleMs?: number; hardMs?: number; keep?: number; }

export const IDLE_MS = 180_000;  // 3 min with NO new output → presumed hung → kill
export const HARD_MS = 600_000;  // 10 min absolute ceiling regardless of activity
const KEEP = 2_000_000;          // retain up to ~2MB per stream (memory bound; streaming ⇒ never ENOBUFS)

/** Run a shell command, streaming output (no buffer cap). Resolves — never rejects — with captured
 *  stdout/stderr, the exit code, and which timeout (if any) fired. */
export function runShell(command: string, cwd: string, opts: ShellOpts = {}): Promise<ShellResult> {
  const idleMs = opts.idleMs ?? IDLE_MS;
  const hardMs = opts.hardMs ?? HARD_MS;
  const keep = opts.keep ?? KEEP;
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try { child = spawn(command, { cwd, shell: true, detached: true }); }
    catch (e: any) { resolve({ stdout: '', stderr: String(e?.message ?? e), code: null, timedOut: null }); return; }

    let stdout = '', stderr = '', timedOut: 'idle' | 'hard' | null = null, done = false;
    const keepTail = (s: string) => (s.length > keep ? s.slice(s.length - keep) : s);
    // SIGTERM the whole group (negative pid) so a build's child processes die too; fall back to the child.
    const kill = () => { try { process.kill(-(child.pid as number), 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* already gone */ } } };

    let idle: NodeJS.Timeout;
    const bumpIdle = () => { clearTimeout(idle); idle = setTimeout(() => { timedOut = 'idle'; kill(); }, idleMs); };
    const hard = setTimeout(() => { timedOut = 'hard'; kill(); }, hardMs);
    const finish = (code: number | null) => {
      if (done) { return; }
      done = true; clearTimeout(idle); clearTimeout(hard);
      resolve({ stdout, stderr, code, timedOut });
    };

    bumpIdle();
    child.stdout?.on('data', (d) => { stdout = keepTail(stdout + d.toString()); bumpIdle(); });
    child.stderr?.on('data', (d) => { stderr = keepTail(stderr + d.toString()); bumpIdle(); });
    child.on('error', (e: any) => { stderr = keepTail(stderr + String(e?.message ?? e)); finish(null); });
    child.on('close', (code) => finish(code));
  });
}

/** Trim a stream for the model: keep head + tail, drop the middle (build errors/results cluster at the end). */
export function trimForModel(s: string, max = 6000): string {
  if (!s || s.length <= max) { return s || ''; }
  const head = s.slice(0, Math.floor(max * 0.4));
  const tail = s.slice(s.length - Math.floor(max * 0.6));
  return `${head}\n...(${s.length - max} chars truncated)...\n${tail}`;
}
