// [SCOPE] Chat panel webview message listener script — extracted from chatPanelScript.ts (Rule 9 split)

export function buildListenerScript(): string {
  return `
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'refresh') location.reload();
      if (msg.type === 'update-conversation') {
        if (msg.html !== undefined) {
          conv.innerHTML = msg.html; conv.scrollTop = conv.scrollHeight;
          var strip = document.getElementById('preview-chat-last');
          if (strip) {
            var lastMsg = conv.querySelector('.msg-assistant:last-child');
            if (lastMsg) { strip.textContent = (lastMsg.textContent || '').trim().slice(0, 220); }
          }
        }
        return;
      }
      if (msg.type === 'set-status') {
        const s = document.getElementById('redivivus-status');
        if (s) { if (msg.status === 'working') { s.classList.add('redivivus-working'); startPhraseTicker(); setInputBusy(true); } else { s.classList.remove('redivivus-working'); stopPhraseTicker(); s.textContent = ' ready'; setInputBusy(false); } }
        var stripBtn = document.getElementById('preview-chat-send-btn');
        if (stripBtn) { stripBtn.disabled = msg.status === 'working'; stripBtn.style.opacity = msg.status === 'working' ? '0.4' : '1'; }
      }
      if (msg.type === 'browse-result') {
        const pi = document.getElementById('np-folder-path');
        const ni = document.getElementById('np-name');
        if (pi && msg.folderPath) {
          const slug = ni ? (ni.value.trim() || 'my-project').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() : 'my-project';
          pi.value = msg.folderPath.replace(/[/]+$/, '') + '/' + slug;
        }
      }
      if (msg.type === 'show-panel') {
        if (msg.panelType === 'getting-started') showGettingStarted();
        else if (msg.panelType === 'start-session') showStartSessionPanel();
        else if (msg.panelType === 'new-project') showNewProjectPanel(msg.suggestedParent, msg.prefillTask, !!msg.compact, !!msg.vaultOnly, msg.prefillAnswers);
        else if (msg.panelType === 'create-folder') showCreateFolderPanel(msg.prefillName, msg.pendingTask);
        else if (msg.panelType === 'expanded-interview') showExpandedInterviewPanel(msg.prefillTask, msg.complexity);
        else showContentPanel(msg.title, msg.content);
      }
      if (msg.type === 'inject-text' && input && msg.text) { input.value = msg.text; input.focus(); }
      if (msg.type === 'update-title') { var ts = document.querySelector('.header-left strong'); if (ts && msg.html) { ts.innerHTML = msg.html; } }
      if (msg.type === 'bi-start') showBlueprintInterview();
      if (msg.type === 'bi-layers') { window._biLayers = msg.layers || []; window._biLayerIdx = 0; window._biRender(window._biLayers[0]); }
      if (msg.type === 'bi-done') { document.getElementById('blueprint-interview-root')?.remove(); document.body.style.overflow = ''; }
      if (msg.type === 'show-mode-popover') { _pendingSendText = msg.pendingText || null; showModePopover(msg.pendingText || ''); }
      if (msg.type === 'show-projects-modal') showProjectsModal(msg.projects);
      if (msg.type === 'show-template-wizard') showTemplateWizard(msg);
      if (msg.type === 'show-placement-check') showPlacementCheckPanel(msg.placementId, msg.projectName, msg.noProject);
      if (msg.type === 'show-cost-estimate') showCostEstimatePanel(msg.buildId, msg.estimate);
      if (msg.type === 'show-scope-modal') showScopeModal(msg.task);
      if (msg.type === 'show-vault-hit') showVaultHitPanel(msg.resolverId, msg.task, msg.matchCount, msg.isSemantic);
      if (msg.type === 'trigger-preview' && window.__redivivusPreviewShow) { window.__redivivusPreviewShow(); }
      if (msg.type === 'preview-loading' && window.__redivivusPreviewSetLoading) { window.__redivivusPreviewSetLoading(msg.message || 'Starting server…'); }
      if (msg.type === 'preview-ready' && window.__redivivusPreviewSetReady) { window.__redivivusPreviewSetReady(msg.port); }
      if (msg.type === 'preview-error' && window.__redivivusPreviewSetError) { window.__redivivusPreviewSetError(msg.message || 'Could not start server.'); }
      if (msg.type === 'preview-refresh' && window.__redivivusPreviewRefresh) { window.__redivivusPreviewRefresh(); }
      if (msg.type === 'preview-show-refresh' && window.__redivivusPreviewShowAndRefresh) { window.__redivivusPreviewShowAndRefresh(); }
      if (msg.type === 'preview-reverted') {
        var revLast = document.getElementById('preview-chat-last');
        if (revLast) { revLast.textContent = '↩ Reverted — files restored.'; }
      }
      if (msg.type === 'preview-fix-applied' && msg.snapId) {
        var fixLast = document.getElementById('preview-chat-last');
        if (fixLast) { fixLast.innerHTML = '✓ Fixed — <button data-action="preview-revert" data-snap="' + msg.snapId + '" style="background:rgba(248,113,113,0.18);border:1px solid #f87171;color:#f87171;padding:1px 8px;border-radius:4px;cursor:pointer;font-size:11px;margin:0 4px;">↩ Revert</button><button data-action="preview-save" style="background:rgba(52,211,153,0.12);border:1px solid #34d399;color:#34d399;padding:1px 8px;border-radius:4px;cursor:pointer;font-size:11px;">📌 Save</button>'; }
      }
      if (msg.type === 'redivivus-drag-drop') { vscode.postMessage(msg.inside ? { type: 'redivivus-drag-drop', inside: true, fromParentPath: msg.fromParentPath, fromIndex: msg.fromIndex, toPath: msg.toPath, snapId: window._rearrangeSnap } : msg.transplant ? { type: 'redivivus-drag-drop', transplant: true, fromParentPath: msg.fromParentPath, fromIndex: msg.fromIndex, refPath: msg.refPath, after: msg.after, snapId: window._rearrangeSnap } : { type: 'redivivus-drag-drop', parentPath: msg.parentPath, fromIndex: msg.fromIndex, toIndex: msg.toIndex, snapId: window._rearrangeSnap }); }
      if (msg.type === 'redivivus-hud-save') { vscode.postMessage({ type: 'rearrange-finish', snapId: window._rearrangeSnap }); }
      if (msg.type === 'redivivus-hud-revert') { vscode.postMessage({ type: 'rearrange-undo', snapId: window._rearrangeSnap }); }
      if (msg.type === 'rearrange-active') {
        window._rearrangeSnap = msg.snapId;
        var mb = document.getElementById('preview-move-btn'); if (mb) mb.classList.add('active');
        var rl = document.getElementById('preview-chat-last'); if (rl) rl.innerHTML = '↕ Move — click element, then: <button data-action="mv-up" style="background:rgba(137,180,250,0.15);border:1px solid #89b4fa;color:#89b4fa;padding:1px 8px;border-radius:4px;cursor:pointer;font-size:11px;">↑ Up</button> <button data-action="mv-dn" style="background:rgba(137,180,250,0.15);border:1px solid #89b4fa;color:#89b4fa;padding:1px 8px;border-radius:4px;cursor:pointer;font-size:11px;">↓ Down</button> or drag. <button data-action="rearrange-toggle" style="background:rgba(137,180,250,0.15);border:1px solid #89b4fa;color:#89b4fa;padding:1px 8px;border-radius:4px;cursor:pointer;font-size:11px;">✓ Done</button>';
      }
      if (msg.type === 'rearrange-moved') {
        window._rearrangeSnap = msg.snapId || window._rearrangeSnap;
        var rl2 = document.getElementById('preview-chat-last'); if (rl2) rl2.innerHTML = '↕ Moved — <button data-action="mv-up" style="background:rgba(137,180,250,0.15);border:1px solid #89b4fa;color:#89b4fa;padding:1px 8px;border-radius:4px;cursor:pointer;font-size:11px;">↑ Up</button> <button data-action="mv-dn" style="background:rgba(137,180,250,0.15);border:1px solid #89b4fa;color:#89b4fa;padding:1px 8px;border-radius:4px;cursor:pointer;font-size:11px;">↓ Down</button> <button data-action="rearrange-undo" style="background:rgba(248,113,113,0.15);border:1px solid #f87171;color:#f87171;padding:1px 8px;border-radius:4px;cursor:pointer;font-size:11px;">↩ Undo</button> <button data-action="rearrange-toggle" style="background:rgba(166,227,161,0.15);border:1px solid #a6e3a1;color:#a6e3a1;padding:1px 8px;border-radius:4px;cursor:pointer;font-size:11px;">✓ Done</button>';
      }
      if (msg.type === 'rearrange-done' || msg.type === 'rearrange-error') {
        window._rearrangeSnap = null;
        var mb2 = document.getElementById('preview-move-btn'); if (mb2) mb2.classList.remove('active');
        var rl3 = document.getElementById('preview-chat-last'); if (rl3) rl3.textContent = msg.type === 'rearrange-error' ? '⚠ ' + (msg.message || 'Move failed') : '✓ Done';
      }
      if (msg.type === 'show-visual-editor' && msg.contract) { veOpen(msg.contract); }
      if (msg.type === 'visual-patch-ack') {
        veShowStatus(msg.ok ? 'Saved ✓' : '⚠ ' + (msg.message || 'Error'), !msg.ok);
        if (msg.ok) {
          var vb = document.getElementById('ve-apply'); if(vb) vb.disabled = true;
          vePending = {};
          if (msg.contract) { veContract = msg.contract; veRenderTab(); }
        } else {
          var vb2 = document.getElementById('ve-apply'); if(vb2) vb2.disabled = false;
        }
      }
      if (msg.type === 'update-agent-badge') {
        window._agentMode = !!msg.agentMode;
        const badgeEl = document.querySelector('.badge.mode[data-action="show-agent-info"]');
        if (badgeEl && msg.html) { badgeEl.outerHTML = msg.html; }
      }
    });
    document.addEventListener('keydown', function(e) {
      if (!window._rearrangeSnap) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Escape') return;
      var frame = document.getElementById('preview-frame');
      if (frame && frame.contentWindow) { e.preventDefault(); frame.contentWindow.postMessage({ type: 'redivivus-key', key: e.key }, '*'); }
    });
  `;
}
