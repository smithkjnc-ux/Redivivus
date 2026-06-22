// [SCOPE] Chat Panel Renderer Cards — Story, Action, Result, Breakdown
// Extracted from chatPanelRenderer.ts. Keep under 200 lines.

import { escapeHtml } from './chatPanelRenderer';

export function renderStoryBlock(content: string, timeStr: string, bubbleClass: string): string | null {
  const match = content.match(/^(__STORY_DONE__|__STORY__)([\s\S]+?)\|\|\|END_STORY__$/);
  if (!match) {return null;}
  const isDone = match[1] === '__STORY_DONE__';
  const storyLines = match[2].split('|||').filter(l => l.trim());
  const linesHtml = storyLines.map((line, i) => {
    const isLast = !isDone && i === storyLines.length - 1;
    return `<div class="story-line${isLast ? ' story-line-active' : ''}"><span class="story-dot">${isLast ? '⚙️' : '✅'}</span><span>${escapeHtml(line)}</span></div>`;
  }).join('');
  const hdr = isDone ? `<div class="story-header" style="color:#4ec959;">✅ Here&apos;s what I built</div>` : `<div class="story-header">🔨 Building your project...</div>`;
  return `<div class="${bubbleClass}"><div class="message-content"><div class="story-panel">${hdr}${linesHtml}</div></div><div class="message-meta">${timeStr}</div></div>`;
}

/** Convert a raw model ID like "claude-haiku-4-5-20251001" to "Claude Haiku 4.5" */
function friendlyModelName(modelId: string): string {
  const m = modelId.toLowerCase();
  if (m.includes('claude')) {
    const tier = m.includes('haiku') ? 'Haiku' : m.includes('sonnet') ? 'Sonnet' : m.includes('opus') ? 'Opus' : '';
    const ver = m.match(/claude-\w+-(\d+)-(\d+)/);
    return tier ? `Claude ${tier}${ver ? ` ${ver[1]}.${ver[2]}` : ''}` : 'Claude';
  }
  if (m.includes('gemini')) {
    const ver = m.match(/gemini-([\d.]+)-(flash|pro|ultra)/i);
    return ver ? `Gemini ${ver[1]} ${ver[2].charAt(0).toUpperCase() + ver[2].slice(1)}` : 'Gemini';
  }
  if (m.includes('gpt-4o')) { return m.includes('mini') ? 'GPT-4o Mini' : 'GPT-4o'; }
  if (m.includes('gpt-4')) { return 'GPT-4'; }
  if (m.startsWith('o1')) { return 'OpenAI o1'; }
  if (m.startsWith('o3')) { return 'OpenAI o3'; }
  if (m.includes('llama')) { return 'Llama'; }
  if (m.includes('grok')) { return 'Grok'; }
  if (m.includes('kimi') || m.includes('moonshot')) { return 'Kimi'; }
  return modelId;
}

const ROLE_EMOJI: Record<string, string> = { supervisor: '[S]', worker: '[W]', solo: '[B]', routing: '[R]' };
const ROLE_LABEL: Record<string, string> = { supervisor: 'Supervisor', worker: 'Worker', solo: 'Builder', routing: 'Router' };

/** Specific plain-English description of what this AI did, per action */
function friendlyAction(role: string, actions: string[]): string {
  const parts: string[] = [];
  if (actions.includes('classified')) { parts.push('Classified intent & routed request'); }
  if (actions.includes('planned'))   { parts.push('Wrote the build prescription'); }
  if (actions.includes('built'))     { parts.push(role === 'solo' ? 'Planned + built the code' : 'Wrote the code'); }
  if (actions.includes('reviewed'))  { parts.push('Reviewed code quality'); }
  if (actions.includes('corrected')) { parts.push('Auto-corrected issues found in review'); }
  if (actions.includes('fallback'))  { parts.push('Took over as fallback builder'); }
  return parts.join(' &amp; ') || 'Assisted with the build';
}

export function renderAIByline(raw: string): string {
  // [FIX] Accumulate a grand total across every role (Supervisor + Worker + any failover) — the card
  // listed each model but never summed them, so the user could not see the real total spend for the build.
  let totTokens = 0, totCost = 0;
  const rows = raw.split('|||').filter(Boolean).map((entry: string) => {
    const parts = entry.split('~');
    const ai = parts[0] || 'unknown';
    const role = parts[1] || 'solo';
    const actions = (parts[2] || '').split(',').filter(Boolean);
    const tokens = parseInt(parts[3] || '0', 10);
    const cost = parseFloat(parts[4] || '0');
    totTokens += tokens; totCost += cost;
    const hasFallback = parts[5] === '1';
    // [FIX] parts[6] arrives pre-escaped — renderMessages calls escapeHtml on the full message
    // before token replacement runs. A second escapeHtml here double-escapes quotes ("→&quot;→&amp;quot;)
    // causing entity codes to display literally. Use the value as-is.
    const reason = parts[6] ? parts[6].trim() : '';
    const name = friendlyModelName(ai);
    const what = friendlyAction(role, actions);
    const emoji = ROLE_EMOJI[role] || '[?]';
    const roleLabel = ROLE_LABEL[role] || role;
    const costStr = cost > 0.0001 ? ` · $${cost.toFixed(4)}` : '';
    const tokStr = tokens > 0 ? `${tokens.toLocaleString()} tokens${costStr}` : '';
    const fallbackBadge = hasFallback ? ` <span style="color:#f59e0b;font-size:9px;">FALLBACK</span>` : '';
    const reasonNote = reason ? `<br><span style="color:var(--vscode-descriptionForeground);font-size:10px;font-style:italic;">${reason}</span>` : '';
    return `<div style="padding:7px 0;border-top:1px solid var(--vscode-input-border);font-size:11px;line-height:1.6;">`
      + `<span style="color:var(--vscode-descriptionForeground);font-size:10px;">${emoji} ${escapeHtml(roleLabel)}</span>${fallbackBadge}<br>`
      + `<strong style="color:var(--vscode-foreground);font-size:12px;">${escapeHtml(name)}</strong>`
      + ` <span style="color:var(--vscode-descriptionForeground);">&#8212; ${what}</span>`
      + (tokStr ? `<br><span style="color:var(--vscode-descriptionForeground);font-size:10px;">${tokStr}</span>` : '')
      + reasonNote
      + `</div>`;
  });
  const id = 'ai-' + Math.random().toString(36).slice(2, 7);
  // Grand-total row — always show the summed cost so the user sees the full spend at a glance, even when
  // the per-row breakdown is collapsed. Cost under a tenth of a cent shows as <$0.0001 rather than $0.0000.
  const totCostStr = totCost > 0.0001 ? `$${totCost.toFixed(4)}` : (totCost > 0 ? '<$0.0001' : '$0');
  const totalRow = `<div style="padding:7px 0;border-top:2px solid var(--vscode-input-border);font-size:11px;">`
    + `<strong style="color:var(--vscode-foreground);">Total</strong> `
    + `<span style="color:var(--vscode-descriptionForeground);">&#8212; ${totTokens.toLocaleString()} tokens · ${totCostStr}</span></div>`;
  return `<div style="margin-top:8px;padding:8px;background:var(--vscode-input-background);border-radius:6px;border:1px solid var(--vscode-input-border);">`
    + `<div style="font-size:10px;font-weight:700;color:var(--vscode-descriptionForeground);cursor:pointer;letter-spacing:0.3px;" onclick="var d=document.getElementById('${id}');d.style.display=d.style.display==='none'?'block':'none';">AI Used [-]</div>`
    + `<div id="${id}" style="margin-top:4px;">${rows.join('')}${totalRow}</div></div>`;
}

export function renderActionCard(command: string, label: string): string {
  return `<div style="margin:10px 0;padding:10px 14px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:10px;" data-cmd="${command}"><span style="flex:1;">${escapeHtml(label)}</span><span style="font-size:11px;opacity:0.7;">Tap to run ▶</span></div>`;
}

// [TOOL-GAP] User-facing "you need to install this" card. Addressed to the USER (not the owner): plain-English
// purpose, the exact command for their OS, and Copy / Open-in-terminal buttons. We never auto-install — the
// terminal hand-off pre-fills the command but the user runs it (their permission + password). Reuses the
// existing retry-fix-btn for "Retry when done". Input is base64(JSON{items:MissingCap[], retry:b64(userText)}).
export function renderToolGapCard(b64: string): string {
  let data: any = {};
  try { data = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8')); } catch { return ''; }
  const items: any[] = Array.isArray(data.items) ? data.items : [];
  if (!items.length) { return ''; }
  const head = items.length === 1 ? "One thing's missing" : `${items.length} things are missing`;
  const rows = items.map((c) => {
    const cmd = String(c.install || '');
    const cmd64 = Buffer.from(cmd, 'utf-8').toString('base64');
    const what = c.what ? ` — ${escapeHtml(String(c.what))}` : '';
    const kindTag = c.kind === 'module' ? 'Python package' : 'tool';
    const note = c.note ? `<div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:4px;">↳ ${escapeHtml(String(c.note))}</div>` : '';
    return `<div style="margin:10px 0;padding:10px 12px;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);border-radius:8px;">`
      + `<div style="font-size:13px;"><strong>${escapeHtml(String(c.name))}</strong> <span style="font-size:10px;opacity:0.6;">(${kindTag})</span>${what}. <span style="opacity:0.8;">It's not installed on your computer.</span></div>`
      + `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;">`
      + `<code style="flex:1;min-width:180px;padding:6px 10px;background:var(--vscode-textCodeBlock-background,#1e1e1e);border-radius:5px;font-family:var(--vscode-editor-font-family,monospace);font-size:12px;overflow-x:auto;">${escapeHtml(cmd)}</code>`
      + `<button class="tg-copy" data-cmd="${cmd64}" style="padding:5px 10px;border:1px solid var(--vscode-input-border);border-radius:5px;background:transparent;color:var(--vscode-foreground);cursor:pointer;font-size:12px;">📋 Copy</button>`
      + `<button class="tg-term" data-cmd="${cmd64}" style="padding:5px 10px;border:none;border-radius:5px;background:#0e639c;color:#fff;cursor:pointer;font-size:12px;font-weight:600;">▶ Open in terminal</button>`
      + `</div>${note}</div>`;
  }).join('');
  const retry = data.retry
    ? `<button class="retry-fix-btn" data-retry="${escapeHtml(String(data.retry))}" style="margin-top:4px;padding:6px 14px;background:#1f8a3b;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600;">&#x21A9; Retry when done</button>`
    : '';
  return `<div style="margin:12px 0;padding:14px;background:var(--vscode-editorWidget-background,var(--vscode-input-background));border:1px solid #d9822b;border-radius:10px;">`
    + `<div style="font-weight:700;font-size:14px;margin-bottom:4px;">⚠️ ${head}</div>`
    + `<div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:6px;">To finish this, your computer needs the software below. Installing it asks for your permission and password, so Redivivus won't change your computer on its own — run whichever you're comfortable with, then Retry.</div>`
    + `${rows}`
    + `<div style="font-size:11px;color:var(--vscode-descriptionForeground);margin:8px 0;">“Open in terminal” fills the command in for you — you press Enter and type your password. Nothing runs until you do.</div>`
    + `${retry}</div>`;
}

export function renderResultCard(summary: string): string {
  // [FIX] summary is already HTML-escaped by renderMessages — do NOT call escapeHtml again (double-escape shows &amp;).
  // Apply minimal markdown on pre-escaped content.
  const body = summary.trim()
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
  return `<div style="margin:12px 0;padding:14px;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);border-radius:8px;"><div style="font-weight:700;margin-bottom:6px;">🎉 Build Complete</div><div style="font-size:13px;line-height:1.5;">${body}</div></div>`;
}
