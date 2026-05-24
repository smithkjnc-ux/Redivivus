// [SCOPE] Pipeline Tracer — singleton debug service that logs every AI pipeline step
// to the "CHASSIS Pipeline Trace" VS Code Output Channel. Stores last 20 traces in memory.
// [WARN] Output channel is created lazily — safe to import from any file, no activation cost.

import * as vscode from 'vscode';

interface TraceStep {
  id: string;
  name: string;
  model?: string;
  startMs: number;
  status: 'success' | 'fail' | 'timeout' | 'pending';
}

interface PipelineTrace {
  id: number;
  task: string;
  startTime: number;
  steps: TraceStep[];
  seq: number;
}

class PipelineTracerSvc {
  private traces: PipelineTrace[] = [];
  private current: PipelineTrace | null = null;
  private _ch: vscode.OutputChannel | null = null;
  private count = 0;

  private ch(): vscode.OutputChannel {
    if (!this._ch) {this._ch = vscode.window.createOutputChannel('CHASSIS Pipeline Trace');}
    return this._ch;
  }

  private ts(ms: number): string {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(ms % 1000).padStart(3,'0')}`;
  }

  /** Begin a new pipeline trace for a user request. Ends any active trace first. */
  start(task: string): void {
    if (this.current) {this.end([], 0, 0);}
    this.count++;
    this.current = { id: this.count, task, startTime: Date.now(), steps: [], seq: 0 };
    const ch = this.ch();
    ch.appendLine('');
    ch.appendLine(`═══ TRACE #${this.count} — "${task.slice(0, 60)}" ═══`);
    ch.appendLine(`[${this.ts(0)}] INPUT        → "${task.slice(0, 100)}"`);
  }

  /** Record the start of a pipeline step. Returns a stepId for use with done(). */
  step(name: string, model?: string, inputSummary?: string): string {
    if (!this.current) {return '';}
    const sid = String(++this.current.seq);
    const s = (inputSummary || '').slice(0, 80);
    this.current.steps.push({ id: sid, name, model, startMs: Date.now() - this.current.startTime, status: 'pending' });
    if (s) {this.ch().appendLine(`[${this.ts(this.current.steps[this.current.steps.length-1].startMs)}] ${name.toUpperCase().padEnd(12)} → starting${model ? ` (${model})` : ''}${s ? ` — "${s}"` : ''}...`);}
    return sid;
  }

  /** Record completion of a pipeline step. */
  done(sid: string, ok: 'success' | 'fail' | 'timeout', durationMs: number, detail = '', tokIn = 0, tokOut = 0): void {
    const step = this.current?.steps.find(s => s.id === sid);
    if (!step) {return;}
    step.status = ok;
    const icon = ok === 'success' ? '✅' : ok === 'timeout' ? '⏱️' : '❌';
    let line = `[${this.ts(step.startMs)}] ${step.name.toUpperCase().padEnd(12)} → `;
    if (step.model) {line += `${step.model} | `;}
    if (tokIn)  {line += `prompt: ${tokIn.toLocaleString()} tokens | `;}
    if (tokOut) {line += `response: ${tokOut.toLocaleString()} tokens `;}
    line += `(${durationMs}ms) ${icon}`;
    if (detail) {line += ` — ${detail.slice(0, 80)}`;}
    this.ch().appendLine(line);
  }

  /** Log an AI model failover event. */
  failover(from: string, to: string, reason: string): void {
    if (!this.current) {return;}
    const ms = Date.now() - this.current.startTime;
    this.ch().appendLine(`[${this.ts(ms)}] FAILOVER     → ${from} ${reason} — retrying with ${to}`);
  }

  /** Log a vault operation. */
  vault(action: 'search' | 'hit' | 'save', detail: string): void {
    if (!this.current) {return;}
    const ms = Date.now() - this.current.startTime;
    const label = action === 'save' ? 'VAULT-SAVE' : action === 'hit' ? 'VAULT-HIT ' : 'VAULT-SRCH';
    this.ch().appendLine(`[${this.ts(ms)}] ${label}   → ${detail.slice(0, 120)}`);
  }

  /** Log a pipeline gate check (scope, cost, vault-hit). */
  gate(name: string, result: string): void {
    if (!this.current) {return;}
    const ms = Date.now() - this.current.startTime;
    this.ch().appendLine(`[${this.ts(ms)}] THREE-GATE   → ${name}: ${result}`);
  }

  /** Log file write operations. */
  fileOp(files: string[]): void {
    if (!this.current) {return;}
    const ms = Date.now() - this.current.startTime;
    this.ch().appendLine(`[${this.ts(ms)}] FILE-WRITE   → ${files.join(', ')}`);
  }

  /** End the active trace and append summary line. */
  end(files: string[], tokens: number, costUSD: number): void {
    if (!this.current) {return;}
    const elapsed = Date.now() - this.current.startTime;
    this.ch().appendLine(`[${this.ts(elapsed)}] COMPLETE     → Total: ${elapsed}ms | Cost: $${costUSD.toFixed(4)} | Files: ${files.join(', ') || '(none)'}`);
    this.ch().appendLine(`═══ END TRACE #${this.current.id} ═══`);
    this.traces.push({ ...this.current, steps: [...this.current.steps] });
    if (this.traces.length > 20) {this.traces.shift();}
    this.current = null;
  }

  /** Show the Output Channel. Prints a hint if no traces exist yet. */
  show(): void {
    const ch = this.ch();
    if (!this.traces.length && !this.current) {ch.appendLine('[No traces yet — build something first to capture a pipeline trace]');}
    ch.show(true);
  }

  getRecent(): PipelineTrace[] { return [...this.traces]; }
}

export const tracer = new PipelineTracerSvc();
