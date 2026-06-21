// [SCOPE] Chat Panel Renderer — renderMessages() and all token/content renderers
// Extracted from chatPanelHtml.ts. Keep under 200 lines.

import type { ChatMessage } from './chatPanelHtml';
import { renderStoryBlock, renderAIByline, renderActionCard, renderResultCard, renderToolGapCard } from './chatPanelRendererCards';
import { renderFeedbackBlock, renderArchitectActions, renderArchitectConfirm, renderUndoButton } from './chatPanelRendererArchitect';
import { renderClarifyCard } from './chatPanelRendererClarify';
import { renderBlueprintGapsToken, renderBlueprintCardToken } from './chatPanelRendererBlueprintCard';
import {
  TOK_RESULT_CARD_START, TOK_RESULT_CARD_END, TOK_AI_BREAKDOWN, TOK_AI_BREAKDOWN_END,
  TOK_BUILD_FEEDBACK, TOK_BUILD_FEEDBACK_END, TOK_ARCHITECT_ACTIONS, TOK_ARCHITECT_ACTIONS_END,
  TOK_ARCH_CONFIRM, TOK_ARCH_CONFIRM_END, TOK_UNDO_BUILD, TOK_UNDO_BUILD_END,
  TOK_BUILD_RESULT, TOK_BUILD_RESULT_END, TOK_PREVIEW_BROWSER, TOK_PREVIEW_BROWSER_END,
  TOK_RUN_PROJECT, TOK_RUN_PROJECT_END, TOK_EDIT_VISUALLY, TOK_EDIT_VISUALLY_END,
  TOK_PLAN_GATE, TOK_PLAN_GATE_END, TOK_BLUEPRINT_GAPS, TOK_BLUEPRINT_GAPS_END,
  TOK_BLUEPRINT_CARD, TOK_BLUEPRINT_CARD_END,
  TOK_CLARIFY, TOK_CLARIFY_END, TOK_TECH_DETAILS, TOK_TECH_DETAILS_END,
  TOK_GITHUB_COMMIT, TOK_GITHUB_COMMIT_END, TOK_VAULT_DEDUP, TOK_VAULT_DEDUP_END,
  TOK_TERMINAL_ERROR,
} from './chatPanelTokens';

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

    // [FIX] Strip internal pipeline enrichments from user bubbles — these should never be visible.
    // routedText sometimes gets stored as the user message content when pipeline stages inject context.
    const displayContent = isUser
      ? msg.content
          .replace(/\n\nUSER EXPERIENCE LEVEL:[^\n]*/g, '')
          .replace(/\n\nVISUAL CONTRACT \(locked[^)]*\):[\s\S]*?(?=\n\n[A-Z]|\n*$)/g, '')
          .trim()
      : msg.content;
    let html = escapeHtml(displayContent);
    html = html.replace(/ ?__BUILD_WORKING__/g, '');
    html = html.replace(/GUARDIAN_PASS\s*/g, '');
    html = html.replace(/📝 (.+)/g, (_m, t) => `<div class="story-line"><span class="story-dot">✅</span><span>${escapeHtml(t)}</span></div>`);
    html = html.replace(/__ACTION_CARD__([^|]+)\|\|\|([^|]+)\|\|\|END__/g, (_m, c, l) => renderActionCard(c, l));
    // [FIX] Plan Approval Gate buttons — Approve/Revise/Cancel. When the token carries an EDIT:: segment
    // (fix-mode inline edit), render an editable textarea pre-filled with the steps and drop Revise (editing
    // inline replaces the need to re-plan).
    html = html.replace(/__PLAN_GATE__([^|]+)\|\|\|(?:EDIT::([^|]*)\|\|\|)?END_PLAN_GATE__/g, (_m, planId, editB64) => {
      const pid = escapeHtml(planId);
      let editor = '';
      if (editB64) {
        let text = '';
        try { text = Buffer.from(editB64, 'base64').toString('utf-8'); } catch { text = ''; }
        editor = `<textarea class="plan-edit" data-plan-id="${pid}" rows="8" spellcheck="false" style="width:100%;box-sizing:border-box;margin:6px 0 10px;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);border-radius:8px;padding:10px 12px;color:var(--vscode-foreground);font-family:var(--vscode-editor-font-family,monospace);font-size:12px;line-height:1.5;resize:vertical;outline:none;">${escapeHtml(text)}</textarea>`;
      }
      const approveLabel = editB64 ? 'Approve &amp; run' : 'Approve Plan';
      const reviseBtn = editB64 ? '' : `<button class="plan-revise-btn" data-plan-id="${pid}" style="padding:8px 16px;border:1px solid #fbbf24;border-radius:8px;background:transparent;color:#fbbf24;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;">Revise</button>`;
      return `<div class="plan-gate-card">${editor}<div class="plan-gate-actions" style="display:flex;gap:10px;margin-top:4px;">`
        + `<button class="plan-approve-btn" data-plan-id="${pid}" style="padding:8px 20px;border:none;border-radius:8px;background:linear-gradient(135deg,#2563eb,#4d9eff);color:#fff;cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 2px 10px rgba(77,158,255,0.3);font-family:inherit;">${approveLabel}</button>`
        + reviseBtn
        + `<button class="plan-cancel-btn" data-plan-id="${pid}" style="padding:8px 16px;border:1px solid #f87171;border-radius:8px;background:transparent;color:#f87171;cursor:pointer;font-size:13px;font-family:inherit;">Cancel</button>`
        + `</div></div>`;
    });
    html = html.replace(/__TOOLGAP__([\s\S]*?)__END_TOOLGAP__/g, (_m, b64) => renderToolGapCard(b64));
    html = html.replace(/__READINESS_BTN__([^_]*)__END_READINESS__/g, (_m, b64) =>
      `<button class="readiness-btn" data-root="${b64}" style="margin-top:8px;padding:7px 14px;border:1px solid #4d9eff;border-radius:8px;background:transparent;color:#4d9eff;cursor:pointer;font-size:12px;font-weight:600;">🚀 Check production readiness</button>`);
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
      // [ADD TO PHONE] Any previewable web result is an installable-PWA candidate — show the button next to Preview.
      return `<div class="build-result" style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;"><button class="preview-browser-btn" data-path="${b64path}">🌐 Preview in Browser</button><button class="add-to-phone-btn" data-path="${b64path}" style="background:linear-gradient(135deg,#0ea5e9,#0369a1);" title="Make this an installable app (phone, tablet, or computer)">&#128230; Convert to PWA</button></div>`;
    });
    // [Redivivus] Run Project button for non-HTML builds
    html = html.replace(/__RUN_PROJECT__([^|]+)\|\|\|END_RUN__/g, (_m, rootPath) => {
      const b64 = encodeBase64(rootPath);
      return `<div class="build-result" style="margin-top:6px;"><button class="run-project-btn" data-path="${b64}" style="background:linear-gradient(135deg,#7c3aed,#5b21b6);">&#9654; Run Project</button></div>`;
    });
    // [FIX] Retry button token — raw <button> in content gets escaped by escapeHtml; use token instead
    html = html.replace(/__RETRY_FIX__:([^_]+)__END_RETRY__/g, (_m, b64) => {
      return `<button class="retry-fix-btn" data-retry="${b64}" style="margin-top:6px;padding:6px 14px;background:#0e639c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;">&#x21A9; Retry</button>`;
    });

    // [FALLBACK] If regex fails, strip any remaining raw BUILD_RESULT tokens to prevent chat blocking
    html = html.replace(/__BUILD_RESULT__[^\n]*/g, '');
    html = html.replace(/__PREVIEW_BROWSER__[^\n]*/g, '');
    
    // [Redivivus] Blueprint token renderers — gap form (existing projects) and confirmation card (new builds)
    html = renderBlueprintGapsToken(html);
    html = renderBlueprintCardToken(html);

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
        + `<div style="font-family:monospace;font-size:11px;white-space:pre-wrap;word-break:break-word;overflow-x:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:10px;margin-top:8px;color:var(--vscode-descriptionForeground);line-height:1.5;">${safe}</div></details>`;
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
      return `<button class="open-workspace-btn" data-path="${b64}" style="margin-top:10px;padding:8px 16px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;width:100%;box-shadow:0 2px 6px rgba(16,185,129,0.3);">&#x1F4C2; Open Project in Explorer</button>`;
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

    // [FIX] Final safety net — strip any raw tokens that slipped through all renderers above.
    // stripRawTokens() is driven by ALL_TOKEN_PREFIXES in chatPanelTokens.ts, so adding a new
    // token there automatically protects it here too.
    const { stripRawTokens } = require('./chatPanelTokens');
    html = stripRawTokens(html);

    const fwdBar = isUser ? '' : (() => {
      const plain = msg.content.replace(/__\w+__[\s\S]*?__END_\w+__/g,'').replace(/__\w+__[^\n]*/g,'').trim();
      const b64 = encodeBase64(plain);
      return `<div style="display:flex;gap:4px;"><button class="msg-fwd-btn" data-fwd="${b64}" title="Forward to input">↩</button><button class="msg-fwd-btn msg-copy-btn" data-copy="${b64}" title="Copy">📋</button></div>`;
    })();
    const meta = isUser ? '' : `<div class="message-meta" style="display:flex;justify-content:space-between;align-items:center;"><span>${tokensStr ? tokensStr + ' &middot; ' : ''}${timeStr}</span>${fwdBar}</div>`;
    return `<div class="${bubbleClass}"><div class="message-content">${html}</div>${meta}</div>`;
  }).join('');
}
