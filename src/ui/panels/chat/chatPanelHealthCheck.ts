// [SCOPE] System health check — collects network, account, AI key, build stats, and provider balances.
// Called on demand (user clicks Health button). Never runs automatically.

import * as path from 'path';
import * as vscode from 'vscode';
import { getApiBase, getAccountToken, collectKeys } from '../../../services/api/apiClient.js';
import { checkProviderBalances } from './chatPanelProviderBalance.js';
import type { ProviderBalance } from './chatPanelProviderBalance.js';
import { readBuildStats, readUsage } from './chatPanelHealthMetrics.js';
import type { BuildStats, UsageSnapshot } from './chatPanelHealthMetrics.js';

interface HealthData {
  checkedAt: string;
  api: { reachable: boolean; latencyMs: number | null; base: string; error?: string };
  buildApi: { reachable: boolean; statusCode: number | null; cloudflare: boolean; detail: string };
  account: { signedIn: boolean };
  keys: Record<string, boolean>;
  buildStats: BuildStats | null;
  projectName: string | null;
  balances: ProviderBalance[];
  usage: UsageSnapshot | null;
}

async function pingApi(base: string): Promise<{ reachable: boolean; latencyMs: number | null; error?: string }> {
  const start = Date.now();
  try {
    // [FIX] Use OPTIONS /build instead of GET /announcements.
    // /announcements does not exist and Next.js returns 500 via its error handler, which
    // looked like a server error. OPTIONS /build always returns 204 when the server is up.
    // Any HTTP response (including 4xx) means the server is reachable — only a network-level
    // error (ECONNREFUSED, timeout) means truly unreachable.
    const res = await fetch(`${base}/build`, { method: 'OPTIONS', signal: AbortSignal.timeout(8000) });
    return { reachable: true, latencyMs: Date.now() - start };
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

export async function collectHealthData(ctx?: vscode.ExtensionContext): Promise<HealthData> {
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
    usage: readUsage(ctx),
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
  const KEY_LABEL: Record<string,string> = { claude:'Claude', gemini:'Gemini', openai:'OpenAI', groq:'Groq', xai:'xAI / Grok', kimi:'Kimi', deepseek:'DeepSeek' };
  const configuredCount = KEY_ORDER.filter(k => d.keys[k]).length;
  const keysCls = configuredCount === 0 ? 'red' : configuredCount < 2 ? 'yellow' : 'green';

  // — Build stats —
  const stats = d.buildStats;
  const failRate = stats ? stats.failed / Math.max(stats.total, 1) : 0;
  const statsCls = !stats ? 'dim' : failRate === 0 ? 'green' : failRate < 0.3 ? 'yellow' : 'red';

  // — Balances —
  const hasBal = d.balances.length > 0;
  const anyOk  = d.balances.some(b => b.status === 'ok');
  // Card accent: green only when every key is valid, yellow if some are, red if none.
  const balCls = !hasBal ? 'dim' : d.balances.every(b => b.status === 'ok') ? 'green' : anyOk ? 'yellow' : 'red';

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

    ${hasBal ? card(`API Key Status`, balCls,
      d.balances.map(b => {
        const cur = b.currency ?? '$';
        const amt = (v: number) => `${cur}${v.toFixed(2)}`;
        // [FIX] This section shows key VALIDITY, not credits/balance — renamed from "API Credits".
        // Colour the status green when the key is valid, red on any issue (invalid key, HTTP 403,
        // timeout). Was dim(grey) for everything, so problems looked the same as healthy keys.
        const validityHtml = b.status === 'ok' ? green(b.detail ?? 'key valid') : red(b.detail ?? 'error');
        return tr(b.label,
          b.status === 'ok' && b.balance !== undefined
            ? (b.balance > 5 ? green(amt(b.balance)) : b.balance > 1 ? yellow(amt(b.balance)) : red(amt(b.balance)))
              + (b.detail ? ' ' + dim(`(${b.detail})`) : '')
            : validityHtml
        );
      }).join('')
    ) : ''}

    ${d.usage ? card('AI Usage (lifetime)', d.usage.lifetimeTokens > 0 ? 'green' : 'dim',
      tr('Total tokens', d.usage.lifetimeTokens > 0 ? d.usage.lifetimeTokens.toLocaleString() : muted('0')) +
      tr('Total cost', d.usage.lifetimeCost > 0 ? `$${d.usage.lifetimeCost.toFixed(4)}` : muted('$0.0000')) +
      d.usage.byProvider.map(p =>
        tr(KEY_LABEL[p.provider] ?? p.provider, `${p.tokens.toLocaleString()} tokens ` + dim(`&middot; $${p.cost.toFixed(4)}`))
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
