// [SCOPE] Blueprint card renderers — renders BLUEPRINT_GAPS (existing-project gap form) and
// BLUEPRINT_CARD (AI-inferred 5W confirmation card) tokens into HTML.
// Extracted from chatPanelRenderer.ts per 200-line rule.

import { escapeHtml } from './chatPanelRenderer.js';

/** Renders __BLUEPRINT_GAPS__ token — gap-question form for initialized projects with incomplete blueprints. */
export function renderBlueprintGapsToken(html: string): string {
  return html.replace(/__BLUEPRINT_GAPS__([a-z0-9]+)\|\|\|(\[.*?\])\|\|\|([^|]*)\|\|\|END_BLUEPRINT_GAPS__/g, (_m, sid, gapsJson) => {
    let gaps: Array<{ field: string; question: string; hint: string; currentValue: string }> = [];
    try { gaps = JSON.parse(gapsJson); } catch { return ''; }
    const fieldInputs = gaps.map(g =>
      `<div class="bp-gap-field" style="margin-bottom:14px;">`
      + `<label style="font-size:12px;font-weight:600;color:var(--vscode-foreground);display:block;margin-bottom:3px;">${escapeHtml(g.question)}</label>`
      + `<div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:5px;">${escapeHtml(g.hint)}</div>`
      + `<input type="text" class="bp-gap-input" data-field="${escapeHtml(g.field)}" value="${escapeHtml(g.currentValue)}" `
      + `placeholder="${escapeHtml(g.hint)}" style="width:100%;box-sizing:border-box;background:var(--vscode-input-background);`
      + `border:1px solid var(--vscode-input-border);color:var(--vscode-foreground);border-radius:6px;`
      + `padding:7px 10px;font-size:13px;font-family:inherit;">`
      + `</div>`
    ).join('');
    return `<div class="bp-gap-card" data-session="${sid}">`
      + `<div class="bp-gap-title">Blueprint Check</div>`
      + `<div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:12px;">Answer these to help me write better code. You can skip and I'll do my best.</div>`
      + fieldInputs
      + `<div style="display:flex;gap:8px;margin-top:8px;">`
      + `<button class="bp-gap-submit-btn" data-session="${sid}" style="padding:6px 16px;background:#4a9eff;color:#0f0f1a;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;">Let's build</button>`
      + `<button class="bp-gap-skip-btn" data-session="${sid}" style="padding:6px 14px;background:none;border:1px solid var(--vscode-input-border);color:var(--vscode-descriptionForeground);border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit;">Skip</button>`
      + `</div></div>`;
  });
}

/** Renders __BLUEPRINT_CARD__ token — AI-inferred 5W confirmation card shown before every new build. */
export function renderBlueprintCardToken(html: string): string {
  return html.replace(/__BLUEPRINT_CARD__([a-z0-9]+)\|\|\|([A-Za-z0-9+/=]+)\|\|\|END_BLUEPRINT_CARD__/g, (_m, sid, payload) => {
    let data: { title: string; fields: Array<{ field: string; label: string; value: string; confidence: string }> };
    try { data = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')); } catch { return ''; }
    const { title, fields } = data;

    const dot = (c: string) => c === 'confident'
      ? '<span style="color:#22c55e;font-size:9px;margin-right:4px;">&#9679;</span>'
      : c === 'assumed'
        ? '<span style="color:#f59e0b;font-size:9px;margin-right:4px;">&#9679;</span>'
        : '<span style="color:#ef4444;font-size:9px;margin-right:4px;">&#9679;</span>';

    const fieldRows = fields.map(f => {
      const isUnknown = f.confidence === 'unknown';
      const hint = f.field === 'who' ? 'who uses this?' : f.field === 'what' ? 'what should it do?' : f.field === 'where' ? 'browser, desktop, CLI...' : f.field === 'when' ? 'deadline or timeline?' : 'what problem does it solve?';
      return `<div class="bpc-row">`
        + `<span class="bpc-label">${dot(f.confidence)}${escapeHtml(f.label)}</span>`
        + (isUnknown
          ? `<input type="text" class="bpc-input" data-field="${f.field}" value="" placeholder="${escapeHtml(hint)}" style="flex:1;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);color:var(--vscode-foreground);border-radius:5px;padding:5px 8px;font-size:12px;font-family:inherit;">`
          : `<span class="bpc-static" data-field="${f.field}" style="flex:1;font-size:12px;color:var(--vscode-foreground);">${escapeHtml(f.value)}`
            + (f.confidence === 'assumed' ? `<span style="font-size:10px;color:var(--vscode-descriptionForeground);margin-left:4px;">(assumed)</span>` : '')
            + `</span><input type="hidden" class="bpc-input" data-field="${f.field}" value="${escapeHtml(f.value)}">`
        )
        + `</div>`;
    }).join('');

    return `<div class="bpc-card" data-session="${sid}">`
      + `<div class="bpc-header">Building: <strong>${escapeHtml(title)}</strong></div>`
      + `<div class="bpc-legend"><span style="color:#22c55e;">&#9679;</span> stated &nbsp;<span style="color:#f59e0b;">&#9679;</span> assumed &nbsp;<span style="color:#ef4444;">&#9679;</span> need answer</div>`
      + `<div class="bpc-fields">${fieldRows}</div>`
      + `<div style="display:flex;gap:8px;margin-top:12px;">`
      + `<button class="bpc-build-btn" data-session="${sid}" style="padding:10px 28px;background:linear-gradient(135deg,#4a9eff,#2563eb);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;box-shadow:0 4px 15px rgba(74,158,255,0.4);letter-spacing:0.3px;">Build it</button>`
      + `<button class="bpc-edit-btn" data-session="${sid}" style="padding:7px 14px;background:none;border:1px solid var(--vscode-input-border);color:var(--vscode-descriptionForeground);border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit;">Change something</button>`
      + `</div></div>`;
  });
}
