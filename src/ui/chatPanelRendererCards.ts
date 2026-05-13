// [SCOPE] Chat Panel Renderer Cards — Story, Action, Result, Breakdown
// Extracted from chatPanelRenderer.ts. Keep under 200 lines.

import { escapeHtml } from './chatPanelRenderer.js';

export function renderStoryBlock(content: string, timeStr: string, bubbleClass: string): string | null {
  const match = content.match(/^(__STORY_DONE__|__STORY__)([\s\S]+?)\|\|\|END_STORY__$/);
  if (!match) return null;
  const isDone = match[1] === '__STORY_DONE__';
  const storyLines = match[2].split('|||').filter(l => l.trim());
  const linesHtml = storyLines.map((line, i) => {
    const isLast = !isDone && i === storyLines.length - 1;
    return `<div class="story-line${isLast ? ' story-line-active' : ''}"><span class="story-dot">${isLast ? '⚙️' : '✅'}</span><span>${escapeHtml(line)}</span></div>`;
  }).join('');
  const hdr = isDone ? `<div class="story-header" style="color:#4ec959;">✅ Here&apos;s what I built</div>` : `<div class="story-header">🔨 Building your project...</div>`;
  return `<div class="${bubbleClass}"><div class="message-content"><div class="story-panel">${hdr}${linesHtml}</div></div><div class="message-meta">${timeStr}</div></div>`;
}

export function renderAIByline(raw: string): string {
  const aiLabels: Record<string, string> = { gemini: 'Gemini 2.5', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq/Llama', xai: 'Grok', kimi: 'Kimi 32k' };
  const rows = raw.split('|||').filter(Boolean).map((entry: string) => {
    const [ai, role, actionsStr, tokensStr, costStr, fallbackStr, ...reasonParts] = entry.split('~');
    const label = aiLabels[ai] || ai;
    const tokens = parseInt(tokensStr || '0', 10);
    const cost = parseFloat(costStr || '0');
    const costDisplay = cost < 0.0001 && cost > 0 ? '&lt;$0.0001' : `$${cost.toFixed(4)}`;
    return `<div style="padding:4px 0;border-top:1px solid var(--vscode-input-border);font-size:11px;display:flex;justify-content:space-between;">`
      + `<span><strong>${escapeHtml(label)}</strong> (${role})</span>`
      + `<span style="color:var(--vscode-descriptionForeground);">${tokens.toLocaleString()} tokens &middot; ${costDisplay}</span></div>`;
  });
  const id = 'ai-' + Math.random().toString(36).slice(2, 7);
  return `<div style="margin-top:8px;padding:8px;background:var(--vscode-input-background);border-radius:6px;border:1px solid var(--vscode-input-border);">`
    + `<div style="font-size:10px;font-weight:700;color:var(--vscode-descriptionForeground);cursor:pointer;" onclick="var d=document.getElementById('${id}');d.style.display=d.style.display==='none'?'block':'none';">WHO DID WHAT [-]</div>`
    + `<div id="${id}" style="display:block;margin-top:4px;">${rows.join('')}</div></div>`;
}

export function renderActionCard(command: string, label: string): string {
  return `<div style="margin:10px 0;padding:10px 14px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:10px;" data-cmd="${command}"><span style="flex:1;">${escapeHtml(label)}</span><span style="font-size:11px;opacity:0.7;">Tap to run \u25b6</span></div>`;
}

export function renderResultCard(summary: string): string {
  return `<div style="margin:12px 0;padding:14px;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);border-radius:8px;"><div style="font-weight:700;margin-bottom:6px;">🎉 Build Complete</div><div style="font-size:13px;line-height:1.5;">${escapeHtml(summary.trim())}</div></div>`;
}
