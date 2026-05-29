// [SCOPE] Chat Panel Renderer — renderMessages() and all token/content renderers
// Extracted from chatPanelHtml.ts. Keep under 200 lines.

import type { ChatMessage } from './chatPanelHtml';
import { renderStoryBlock, renderAIByline, renderActionCard, renderResultCard } from './chatPanelRendererCards';
import { renderFeedbackBlock, renderArchitectActions, renderArchitectConfirm, renderUndoButton } from './chatPanelRendererArchitect';
import { renderClarifyCard } from './chatPanelRendererClarify';

export function escapeHtml(text: string): string {
  const map: { [key: string]: string } = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

export function encodeBase64(text: string): string {
  return Buffer.from(text).toString('base64');
}

export function renderMessages(conversation: ChatMessage[]): string {
  return conversation.map((msg) => {
    const isUser = msg.role === 'user';
    const bubbleClass = isUser ? 'message-bubble user-bubble' : 'message-bubble assistant-bubble';
    const timeStr = new Date(msg.timestamp).toLocaleTimeString();
    const tokensStr = msg.tokens ? `${msg.tokens} tokens` : '';

    const storyHtml = renderStoryBlock(msg.content, timeStr, bubbleClass);
    if (storyHtml) {return storyHtml;}

    let html = escapeHtml(msg.content);
    html = html.replace(/GUARDIAN_PASS\s*/g, '');
    html = html.replace(/📝 (.+)/g, (_m, t) => `<div class="story-line"><span class="story-dot">✅</span><span>${escapeHtml(t)}</span></div>`);
    html = html.replace(/__ACTION_CARD__([^|]+)\|\|\|([^|]+)\|\|\|END__/g, (_m, c, l) => renderActionCard(c, l));
    // [FIX] Plan Approval Gate buttons — renders Approve/Revise/Cancel for build plan review
    html = html.replace(/__PLAN_GATE__([^|]+)\|\|\|END_PLAN_GATE__/g, (_m, planId) => {
      return `<div class="plan-gate-actions" style="display:flex;gap:10px;margin-top:12px;">`
        + `<button class="plan-approve-btn" data-plan-id="${escapeHtml(planId)}" style="padding:8px 20px;border:none;border-radius:8px;background:linear-gradient(135deg,#2563eb,#4d9eff);color:#fff;cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 2px 10px rgba(77,158,255,0.3);font-family:inherit;">Approve Plan</button>`
        + `<button class="plan-revise-btn" data-plan-id="${escapeHtml(planId)}" style="padding:8px 16px;border:1px solid #fbbf24;border-radius:8px;background:transparent;color:#fbbf24;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;">Revise</button>`
        + `<button class="plan-cancel-btn" data-plan-id="${escapeHtml(planId)}" style="padding:8px 16px;border:1px solid #f87171;border-radius:8px;background:transparent;color:#f87171;cursor:pointer;font-size:13px;font-family:inherit;">Cancel</button>`
        + `</div>`;
    });
    html = html.replace(/__RESULT_CARD__([\s\S]*?)__END_RESULT_CARD__/g, (_m, s) => renderResultCard(s));
    html = html.replace(/__AI_BREAKDOWN__([\s\S]*?)\|\|\|END_BREAKDOWN__/g, (_m, r) => renderAIByline(r));
    html = html.replace(/__BUILD_FEEDBACK__([^|]+)\|\|\|END_FEEDBACK__/g, (_m, f) => renderFeedbackBlock(f));
    html = html.replace(/__ARCHITECT_ACTIONS__([^|]+)\|\|\|END_ARCH_ACTIONS__/g, (_m, r) => renderArchitectActions(r));
    html = html.replace(/__ARCH_CONFIRM__([^|]+)\|\|\|([^|]+)\|\|\|END_ARCH_CONFIRM__/g, (_m, r, i) => renderArchitectConfirm(r, i));
    html = html.replace(/__UNDO_BUILD__([^|]+)\|\|\|END_UNDO__/g, (_m, s) => renderUndoButton(s));
    // [FIX] Bug 1: Parse __BUILD_RESULT__ token into Open File button — never show raw token
    html = html.replace(/__BUILD_RESULT__([^|]+)\|\|\|([^|]+)\|\|\|END__/g, (_m, filename, filepath) => {
      const b64path = encodeBase64(filepath);
      return `<div class="build-result"><button class="open-file-btn" data-path="${b64path}">📂 Open ${escapeHtml(filename)}</button></div>`;
    });
    // [Redivivus] Preview in Browser button for HTML/web builds
    html = html.replace(/__PREVIEW_BROWSER__([^|]+)\|\|\|END_PREVIEW_BROWSER__/g, (_m, filepath) => {
      const b64path = encodeBase64(filepath);
      return `<div class="build-result" style="margin-top:6px;"><button class="preview-browser-btn" data-path="${b64path}">🌐 Preview in Browser</button></div>`;
    });
    // [FALLBACK] If regex fails, strip any remaining raw BUILD_RESULT tokens to prevent chat blocking
    html = html.replace(/__BUILD_RESULT__[^\n]*/g, '');
    html = html.replace(/__PREVIEW_BROWSER__[^\n]*/g, '');
    
    // [Redivivus] Guided Blueprint Mode token — renders inline gap question form
    html = html.replace(/__BLUEPRINT_GAPS__([a-z0-9]+)\|\|\|(\[.*?\])\|\|\|([^|]*)\|\|\|END_BLUEPRINT_GAPS__/g, (_m, sid, gapsJson, encodedTask) => {
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
        + `</div>`
        + `</div>`;
    });

    // [Redivivus] Multi-file build clarification token — delegates to chatPanelRendererClarify
    // [WARN] escapeHtml() runs first (line 27), so JSON quotes become &quot; — must unescape before parse
    html = html.replace(/__CLARIFY__(.*?)__END_CLARIFY__/g, (_m, rawJson) => {
      const unescaped = rawJson.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
      try { return renderClarifyCard(JSON.parse(unescaped)); } catch { return ''; }
    });

    // [Redivivus] Vault dedup actions token — renders Merge button
    html = html.replace(/__VAULT_DEDUP_ACTIONS__END_VAULT_DEDUP__/g, () => {
      return `<div class="vault-dedup-actions">`
        + `<button class="vault-dedup-merge-btn" style="padding:5px 14px;background:rgba(251,191,36,0.12);color:#fbbf24;border:1px solid #fbbf24;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;margin-right:8px;">Merge duplicates</button>`
        + `<span style="font-size:11px;color:var(--c-muted);">This will delete the redundant items permanently.</span>`
        + `</div>`;
    });

    // [Redivivus] Technical details collapsible — plain-language fix output hides verbose diagnosis here
    html = html.replace(/__TECH_DETAILS__([\s\S]*?)__END_TECH__/g, (_m, raw) => {
      const content = raw.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#039;/g,"'");
      const safe = content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/`/g, '&#96;');
      return `<details style="margin-top:12px;"><summary style="cursor:pointer;font-size:11px;color:var(--vscode-descriptionForeground);user-select:none;padding:4px 0;">&#x25B6; Technical analysis</summary>`
        + `<pre style="font-size:11px;white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,0.2);border-radius:6px;padding:10px;margin-top:8px;color:var(--vscode-descriptionForeground);line-height:1.5;">${safe}</pre></details>`;
    });

    // [Redivivus] GitHub commit button — shown on fix/build result cards when GitHub is connected
    html = html.replace(/__GITHUB_COMMIT__([A-Za-z0-9+/=]+)\|\|\|END_GITHUB_COMMIT__/g, (_m, b64) => {
      return `<button class="github-commit-btn" data-payload="${b64}" style="margin-top:10px;padding:6px 14px;background:rgba(30,215,96,0.12);color:#1ed760;border:1px solid rgba(30,215,96,0.4);border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;">&#x1F4BE; Commit + Push to GitHub</button>`;
    });

    // [Redivivus] Terminal error token — renders error card with "Fix this error" button
    html = html.replace(/__TERMINAL_ERROR__([A-Za-z0-9+/=]+)\|\|\|END_TERMINAL_ERROR__/g, (_m, b64ctx) => {
      return `<div class="terminal-error-card">`
        + `<div class="terminal-error-label">[!] Terminal Error</div>`
        + `<button class="fix-terminal-error-btn" data-ctx="${b64ctx}" style="margin-top:8px;padding:5px 13px;background:rgba(248,113,113,0.15);color:#f87171;border:1px solid #f87171;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;">Fix this error</button>`
        + `</div>`;
    });

    // [Redivivus] Edit Visually button — opens the Visual Contract Editor panel
    html = html.replace(/__EDIT_VISUALLY__(.+?)\|\|\|END_EDIT_VISUALLY__/g, (_m, rawRoot) => {
      const b64 = encodeBase64(rawRoot);
      return `<button class="edit-visually-btn" data-root="${b64}" style="margin-top:8px;padding:7px 14px;background:linear-gradient(135deg,#89b4fa,#74c7ec);color:#1e1e2e;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit;box-shadow:0 2px 6px rgba(137,180,250,0.3);">✏️ Edit Visually</button>`;
    });

    // [Redivivus] Open workspace token — renders a manual button instead of forcing a window reload
    html = html.replace(/__OPEN_WORKSPACE__(.+?)\|\|\|END_OPEN__/g, (_m, rawPath) => {
      const b64 = encodeBase64(rawPath);
      return `<button class="open-workspace-btn" data-path="${b64}" style="margin-top:10px;padding:8px 16px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;width:100%;box-shadow:0 2px 6px rgba(16,185,129,0.3);">&#x1F4C2; Open Project in Explorer (Reloads Window)</button>`;
    });

    // [FIX] Code block renderer — handles all fence variants, full lang→ext map, auto-filename from first comment
    let codeBlocksCount = 0;
    // [WARN] Regex must handle: ```html, ```html\r\n, ``` (no lang), trailing spaces after lang tag
    // escapeHtml() does NOT escape backticks, so the fence regex works on the already-escaped string
    html = html.replace(/```(\w*)[^\S\r\n]*\r?\n([\s\S]*?)```/g, (_m, lang, code) => {
      codeBlocksCount++;
      // Unescape HTML entities so the saved file contains real code
      const raw = code.trim()
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
      const b64 = encodeBase64(raw);
      // Full lang→ext map covering all common languages AI returns
      const EXT_MAP: Record<string, string> = {
        html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
        javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
        jsx: 'jsx', tsx: 'tsx', python: 'py', py: 'py',
        ruby: 'rb', rb: 'rb', go: 'go', rust: 'rs', rs: 'rs',
        java: 'java', kotlin: 'kt', swift: 'swift', c: 'c', cpp: 'cpp',
        cs: 'cs', php: 'php', sh: 'sh', bash: 'sh', shell: 'sh',
        json: 'json', yaml: 'yaml', yml: 'yml', toml: 'toml',
        sql: 'sql', md: 'md', markdown: 'md', xml: 'xml', svg: 'svg',
      };
      const ext = EXT_MAP[lang.toLowerCase()] || (lang ? lang : 'txt');
      // Derive suggested filename from first-line comment or SCOPE tag
      const firstLine = raw.split('\n')[0]?.trim() || '';
      let suggestedName = `file.${ext}`;
      const fnMatch = firstLine.match(/\/\/\s*([\w.\-/]+\.[a-z0-9]+)/i)
                   || firstLine.match(/\/\*\s*([\w.\-/]+\.[a-z0-9]+)\s*\*\//i)
                   || firstLine.match(/<!--\s*([\w.\-/]+\.[a-z0-9]+)\s*-->/i)
                   || firstLine.match(/\[SCOPE\]\s*([\w.\-/]+\.[a-z0-9]+)/i)
                   || firstLine.match(/#\s*([\w.\-/]+\.[a-z0-9]+)/i);
      if (fnMatch) { suggestedName = fnMatch[1]; }
      const btnLabel = suggestedName !== `file.${ext}` ? `+ Create ${escapeHtml(suggestedName)}` : `+ Create File (.${ext})`;
      return `<div class="code-block"><pre><code class="lang-${escapeHtml(lang)}">${escapeHtml(raw)}</code></pre>`
        + `<button class="create-file-btn" data-code="${b64}" data-ext="${ext}" data-suggested="${escapeHtml(suggestedName)}">${btnLabel}</button></div>`;
    });

    if (codeBlocksCount > 1) {
      html += `<div style="margin-top:12px;padding:10px;border-top:1px solid var(--vscode-input-border);display:flex;align-items:center;justify-content:space-between;">`
        + `<button id="save-all-btn" style="padding:6px 14px;background:#238636;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;">Save All Files</button>`
        + `<span id="save-all-stat" style="font-size:11px;color:var(--vscode-descriptionForeground);"></span></div>`;
    }

    // Markdown: bold, italic, inline code, horizontal rule, line breaks
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?<![`\w])_([^_]+)_(?![`\w])/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:3px;font-size:0.92em;">$1</code>');
    html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--vscode-input-border);margin:8px 0;">');
    html = html.replace(/\n/g, '<br>');

    const meta = isUser ? '' : `<div class="message-meta">${tokensStr} · ${timeStr}</div>`;
    return `<div class="${bubbleClass}"><div class="message-content">${html}</div>${meta}</div>`;
  }).join('');
}
