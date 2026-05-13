// [SCOPE] Chat Panel Renderer — renderMessages() and all token/content renderers
// Extracted from chatPanelHtml.ts. Keep under 200 lines.

import { ChatMessage } from './chatPanelHtml.js';
import { renderStoryBlock, renderAIByline, renderActionCard, renderResultCard } from './chatPanelRendererCards.js';
import { renderFeedbackBlock, renderArchitectActions, renderUndoButton } from './chatPanelRendererArchitect.js';

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
    if (storyHtml) return storyHtml;

    let html = escapeHtml(msg.content);
    html = html.replace(/GUARDIAN_PASS\s*/g, '');
    html = html.replace(/📝 (.+)/g, (_m, t) => `<div class="story-line"><span class="story-dot">✅</span><span>${escapeHtml(t)}</span></div>`);
    html = html.replace(/__ACTION_CARD__([^|]+)\|\|\|([^|]+)\|\|\|END__/g, (_m, c, l) => renderActionCard(c, l));
    html = html.replace(/__RESULT_CARD__([\s\S]*?)__END_RESULT_CARD__/g, (_m, s) => renderResultCard(s));
    html = html.replace(/__AI_BREAKDOWN__([\s\S]*?)\|\|\|END_BREAKDOWN__/g, (_m, r) => renderAIByline(r));
    html = html.replace(/__BUILD_FEEDBACK__([^|]+)\|\|\|END_FEEDBACK__/g, (_m, f) => renderFeedbackBlock(f));
    html = html.replace(/__ARCHITECT_ACTIONS__([^|]+)\|\|\|END_ARCH_ACTIONS__/g, (_m, r) => renderArchitectActions(r));
    html = html.replace(/__UNDO_BUILD__([^|]+)\|\|\|END_UNDO__/g, (_m, s) => renderUndoButton(s));
    
    // [FIX 3] SAVE ALL FILES BUTTON
    let codeBlocksCount = 0;
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
      codeBlocksCount++;
      const raw = code.trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
      const b64 = encodeBase64(raw);
      const ext = lang === 'python' ? 'py' : lang === 'javascript' ? 'js' : lang === 'typescript' ? 'ts' : 'txt';
      return `<div class="code-block"><pre><code>${escapeHtml(raw)}</code></pre><button class="create-file-btn" data-code="${b64}" data-ext="${ext}">Create File</button></div>`;
    });

    if (codeBlocksCount > 1) {
      html += `<div style="margin-top:12px;padding:10px;border-top:1px solid var(--vscode-input-border);display:flex;align-items:center;justify-content:space-between;">`
        + `<button id="save-all-btn" style="padding:6px 14px;background:#238636;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;">💾 Save All Files</button>`
        + `<span id="save-all-stat" style="font-size:11px;color:var(--vscode-descriptionForeground);"></span></div>`;
    }

    const meta = isUser ? '' : `<div class="message-meta">${tokensStr} · ${timeStr}</div>`;
    return `<div class="${bubbleClass}"><div class="message-content">${html}</div>${meta}</div>`;
  }).join('');
}
