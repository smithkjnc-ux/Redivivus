// [SCOPE] Chat Panel Renderer Architect — Architect review and Feedback UI
// Extracted from chatPanelRenderer.ts. Keep under 200 lines.

import { escapeHtml } from './chatPanelRenderer';
import { _architectActions } from './chatPanelMsgArchitect';

export function renderFeedbackBlock(fid: string): string {
  const id = escapeHtml(fid);
  return `<div id="feedback-${id}" style="margin-top:10px;padding:8px 12px;background:#1a2035;border:1px solid #2d3a55;border-radius:8px;">`
    + `<div style="font-size:11px;color:#8899bb;margin-bottom:6px;">Did this build work?</div>`
    + `<div style="display:flex;gap:8px;"><button style="padding:4px 10px;border:1px solid #4caf50;color:#4caf50;background:transparent;cursor:pointer;font-size:11px;" data-feedback="good" data-feedback-id="${id}">Yes</button>`
    + `<button style="padding:4px 10px;border:1px solid #e05555;color:#e05555;background:transparent;cursor:pointer;font-size:11px;" data-feedback="bad" data-feedback-id="${id}">No</button></div>`
    + `<div id="feedback-note-${id}" style="display:none;margin-top:8px;"><textarea id="feedback-input-${id}" placeholder="What failed?" style="width:100%;background:#0f1829;color:#fff;border:1px solid #2d3a55;font-size:11px;"></textarea>`
    + `<button style="margin-top:4px;background:#2563eb;color:#fff;border:none;padding:4px 8px;font-size:11px;" data-feedback-retry="${id}">Retry with Fix</button></div></div>`;
}

export function renderArchitectActions(reviewId: string): string {
  const rid = escapeHtml(reviewId);
  const btn = 'padding:6px 12px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid;font-family:inherit;';
  const actions = _architectActions.get(reviewId) || [];
  let perActionBtns = '';
  if (actions.length > 0) {
    const actionBtns = actions.map((act, i) => {
      const icon = act.action === 'delete' ? '[!]' : act.action === 'create' ? '[+]' : '[fix]';
      return `<button style="${btn}background:rgba(74,158,255,0.1);color:#4a9eff;border-color:rgba(74,158,255,0.3);" `
        + `data-arch-action="per-action" data-review-id="${rid}" data-action-index="${i}">${icon} ${escapeHtml(act.label)}</button>`;
    }).join('');
    perActionBtns = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">${actionBtns}</div>`;
  }
  return `<div style="margin-top:12px;padding:12px;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);border-radius:8px;">`
    + `<div style="font-size:10px;font-weight:700;margin-bottom:8px;color:var(--vscode-descriptionForeground);">ARCHITECT REVIEW</div>`
    + perActionBtns
    + `<div style="display:flex;gap:6px;flex-wrap:wrap;">`
    + `<button style="${btn}background:#0e639c;color:#fff;border-color:#0e639c;" data-arch-action="fix-all" data-review-id="${rid}">Fix All</button>`
    + `<button style="${btn}background:rgba(168,85,247,0.12);color:#a855f7;border-color:rgba(168,85,247,0.4);" data-arch-action="deep-fix" data-review-id="${rid}" title="Routes each fix through the full Supervisor→Worker→Guardian pipeline with retry logic">Deep Fix</button>`
    + `<button style="${btn}background:transparent;color:var(--vscode-descriptionForeground);border-color:transparent;" data-arch-action="dismiss">Dismiss</button>`
    + `</div></div>`;
}

export function renderArchitectConfirm(reviewId: string, actionIndex: string): string {
  const rid = escapeHtml(reviewId);
  const idx = escapeHtml(actionIndex);
  const btn = 'padding:6px 16px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid;font-family:inherit;';
  return `<div style="display:flex;gap:8px;margin-top:10px;">`
    + `<button style="${btn}background:#238636;color:#fff;border-color:#238636;" data-arch-action="confirm" data-review-id="${rid}" data-action-index="${idx}">Confirm</button>`
    + `<button style="${btn}background:transparent;color:var(--vscode-descriptionForeground);border-color:var(--vscode-input-border);" data-arch-action="cancel" data-review-id="${rid}">Cancel</button>`
    + `</div>`;
}

export function renderUndoButton(snapshotId: string): string {
  return `<button style="margin-top:10px;padding:8px;border:1px solid rgba(224,85,85,0.3);background:rgba(224,85,85,0.05);color:#e05555;font-size:11px;width:100%;cursor:pointer;" data-undo-build="${escapeHtml(snapshotId)}">↩ Undo Build</button>`;
}
