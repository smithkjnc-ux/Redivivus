// [SCOPE] System health check — collects network, account, AI key, build stats, and provider balances.
// Called on demand (user clicks Health button). Never runs automatically.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getApiBase, getAccountToken, collectKeys } from '../../../services/api/apiClient.js';
import { checkProviderBalances } from './chatPanelProviderBalance.js';
import type { ProviderBalance } from './chatPanelProviderBalance.js';

interface HealthData {
  checkedAt: string;
  api: { reachable: boolean; latencyMs: number | null; base: string; error?: string };
  buildApi: { reachable: boolean; statusCode: number | null; cloudflare: boolean; detail: string };
  account: { signedIn: boolean };
  keys: Record<string, boolean>;
  buildStats: { total: number; success: number; failed: number; cloud: number; local: number; tokens: number; lastDate: string } | null;
  projectName: string | null;
  balances: ProviderBalance[];
}

async function pingApi(base: string): Promise<{ reachable: boolean; latencyMs: number | null; error?: string }> {
  const start = Date.now();
  try {
    const res = await fetch(`${base}/announcements`, { signal: AbortSignal.timeout(8000) });
    return { reachable: res.ok || res.status < 500, latencyMs: Date.now() - start };
  } catch (e: any) {
    return { reachable: false, latencyMs: null, error: e?.message ?? 'unreachable' };
  }
}

async function checkBuildApi(base: string): Promise<HealthData['buildApi']> {
  try {
    // OPTIONS is lightweight — a 4xx means the endpoint exists; 5xx means server/proxy error
    const res = await fetch(`${base}/build`, { method: 'OPTIONS', signal: AbortSignal.timeout(8000) });
    const cloudflare = !!(res.headers.get('cf-ray') || res.headers.get('server')?.includes('cloudflare'));
    const ok = res.status < 500;
    const who = cloudflare ? ' (Cloudflare)' : '';
    return { reachable: ok, statusCode: res.status, cloudflare,
      detail: ok ? `${res.status} — build endpoint reachable` : `${res.status} server error${who} — cloud builds unavailable` };
  } catch (e: any) {
    return { reachable: false, statusCode: null, cloudflare: false, detail: e?.message ?? 'timeout' };
  }
}

function readBuildStats(root: string): HealthData['buildStats'] {
  try {
    const lines = fs.readFileSync(path.join(root, '.redivivus', 'build_log.jsonl'), 'utf8')
      .trim().split('\n').filter(Boolean);
    if (lines.length === 0) { return null; }
    let success = 0, failed = 0, cloud = 0, local = 0, tokens = 0, lastDate = '';
    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        if (e.error) { failed++; } else { success++; }
        if (e.source === 'cloud') { cloud++; } else { local++; }
        tokens += e.totalTokens ?? 0;
        if (e.timestamp > lastDate) { lastDate = e.timestamp; }
      } catch {}
    }
    return { total: lines.length, success, failed, cloud, local, tokens,
             lastDate: lastDate.slice(0, 16).replace('T', ' ') };
  } catch { return null; }
}

export async function collectHealthData(): Promise<HealthData> {
  const base = getApiBase();
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  const rawKeys = collectKeys();
  const [apiResult, buildApiResult, token, balances] = await Promise.all([
    pingApi(base),
    checkBuildApi(base),
    getAccountToken(),
    checkProviderBalances(rawKeys),
  ]);
  return {
    checkedAt: new Date().toLocaleTimeString(),
    api: { ...apiResult, base },
    buildApi: buildApiResult,
    account: { signedIn: !!token },
    keys: Object.fromEntries(['claude','gemini','openai','groq','xai','kimi'].map(p => [p, !!rawKeys[p]])),
    buildStats: root ? readBuildStats(root) : null,
    projectName: root ? path.basename(root) : null,
    balances,
  };
}

// Compute overall health level for header button coloring.
// Red = blocks coding (no API, no keys, build endpoint down). Yellow = degraded. Green = all clear.
export function getHealthStatus(d: HealthData): 'green' | 'yellow' | 'red' {
  const configuredKeys = Object.values(d.keys).filter(Boolean).length;
  if (!d.api.reachable || !d.buildApi.reachable || configuredKeys === 0) { return 'red'; }
  const failRate = d.buildStats ? d.buildStats.failed / Math.max(d.buildStats.total, 1) : 0;
  if ((d.api.latencyMs !== null && d.api.latencyMs >= 800) || !d.account.signedIn || configuredKeys < 2 || failRate >= 0.3) { return 'yellow'; }
  return 'green';
}

// Uses CSS classes defined in chatPanelStylesInput.ts (.hc-*) — NOT inline color styles.
// Inline color styles are ignored in this WebView context; class-based styles are nonce-approved.
export function buildHealthHtml(d: HealthData): string {
  const cc = (cls: string, text: string) => `<span class="${cls}">${text}</span>`;
  const green  = (t: string) => cc('hc-green',  t);
  const yellow = (t: string) => cc('hc-yellow', t);
  const red    = (t: string) => cc('hc-red',    t);
  const dim    = (t: string) => cc('hc-dim',    t);
  const muted  = (t: string) => cc('hc-muted',  t);

  const tr = (label: string, valueHtml: string) =>
    `<tr><td class="hc-label-cell">${label}</td><td class="hc-value-cell">${valueHtml}</td></tr>`;

  const card = (title: string, colorCls: string, rows: string) =>
    `<div class="hc-card hc-card-${colorCls}">` +
    `<div class="hc-card-title ${colorCls === 'green' ? 'hc-green' : colorCls === 'yellow' ? 'hc-yellow' : colorCls === 'red' ? 'hc-red' : 'hc-dim'}">${title}</div>` +
    `<table class="hc-tbl">${rows}</table></div>`;

  // — Network —
  const ms = d.api.latencyMs;
  const latCls = ms === null ? 'red' : ms < 300 ? 'green' : ms < 800 ? 'yellow' : 'red';
  const latLabel = ms === null ? 'no response' : `${ms}ms &mdash; ${ms < 300 ? 'fast' : ms < 800 ? 'ok' : 'slow'}`;
  const buildApiOk = d.buildApi.reachable;
  const netCls = !d.api.reachable ? 'red' : !buildApiOk ? 'red' : ms !== null && ms >= 800 ? 'yellow' : 'green';

  // — Keys —
  const KEY_ORDER = ['claude','gemini','openai','groq','xai','kimi'];
  const KEY_LABEL: Record<string,string> = { claude:'Claude', gemini:'Gemini', openai:'OpenAI', groq:'Groq', xai:'xAI / Grok', kimi:'Kimi' };
  const configuredCount = KEY_ORDER.filter(k => d.keys[k]).length;
  const keysCls = configuredCount === 0 ? 'red' : configuredCount < 2 ? 'yellow' : 'green';

  // — Build stats —
  const stats = d.buildStats;
  const failRate = stats ? stats.failed / Math.max(stats.total, 1) : 0;
  const statsCls = !stats ? 'dim' : failRate === 0 ? 'green' : failRate < 0.3 ? 'yellow' : 'red';

  // — Balances —
  const hasBal = d.balances.length > 0;
  const anyOk  = d.balances.some(b => b.status === 'ok');
  const balCls = !hasBal ? 'dim' : anyOk ? 'green' : 'dim';

  return `<div style="font-family:var(--vscode-font-family);padding:2px 0;">
    <div class="hc-dim" style="font-size:11px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #1e293b;">
      System Health &mdash; checked at ${d.checkedAt}
    </div>

    ${card('Network / API', netCls,
      tr('API reachable',
        (d.api.reachable ? green('&#x25CF; yes') : red('&#x25CF; no'))
        + (d.api.error ? ' ' + red('&mdash; ' + d.api.error) : '')) +
      tr('Latency',
        latCls === 'green' ? green(latLabel) : latCls === 'yellow' ? yellow(latLabel) : red(latLabel)) +
      tr('Build endpoint',
        buildApiOk
          ? green('&#x25CF; reachable') + ' ' + dim(d.buildApi.detail)
          : red('&#x25CF; ' + d.buildApi.detail) +
            (d.buildApi.cloudflare ? ' ' + yellow('(Cloudflare — origin server down)') : '')) +
      tr('Endpoint', dim(d.api.base.replace('https://','')))
    )}

    ${card('Account', d.account.signedIn ? 'green' : 'red',
      tr('Session',
        d.account.signedIn ? green('&#x25CF; signed in') : red('&#x25CF; not signed in') +
        yellow(' &mdash; run Redivivus: Sign In')) +
      tr('Token quota', dim('not exposed by API'))
    )}

    ${card(`Local AI Keys &mdash; ${configuredCount} / ${KEY_ORDER.length} configured`, keysCls,
      KEY_ORDER.map(k =>
        tr(KEY_LABEL[k], d.keys[k] ? green('&#x25CF; configured') : muted('&#x25CB; not set'))
      ).join('')
    )}

    ${hasBal ? card(`API Credits`, balCls,
      d.balances.map(b =>
        tr(b.label,
          b.status === 'ok' && b.balance !== undefined
            ? (b.balance > 5 ? green(`$${b.balance.toFixed(2)}`) : b.balance > 1 ? yellow(`$${b.balance.toFixed(2)}`) : red(`$${b.balance.toFixed(2)}`))
            + (b.detail ? ' ' + dim(`(${b.detail})`) : '')
            : dim(b.detail ?? 'unavailable')
        )
      ).join('')
    ) : ''}

    ${stats
      ? card(`Build Log &mdash; ${d.projectName ?? 'project'}`, statsCls,
          tr('Total builds',  `${stats.total}`) +
          tr('Successful',    green(String(stats.success))) +
          tr('Failed',        stats.failed > 0 ? red(String(stats.failed)) : muted('0')) +
          tr('Cloud / Local',
            stats.cloud === 0 && stats.local > 0
              ? red(`${stats.cloud} / ${stats.local}`) + ' ' + yellow('(all local fallback)')
              : `${stats.cloud} / ${stats.local}`) +
          tr('Total tokens',  stats.tokens.toLocaleString()) +
          tr('Last build',    stats.lastDate || muted('none'))
        )
      : card('Build Log', 'dim', tr('Status', dim('no log yet &mdash; build something first')))
    }
  </div>`;
}
