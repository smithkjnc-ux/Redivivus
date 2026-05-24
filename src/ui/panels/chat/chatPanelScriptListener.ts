// [SCOPE] Chat panel webview message listener script — extracted from chatPanelScript.ts (Rule 9 split)

export function buildListenerScript(): string {
  return `
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'refresh') location.reload();
      if (msg.type === 'update-conversation') { if (msg.html !== undefined) { conv.innerHTML = msg.html; conv.scrollTop = conv.scrollHeight; } return; }
      if (msg.type === 'set-status') {
        const s = document.getElementById('chassis-status');
        if (s) { if (msg.status === 'working') { s.classList.add('chassis-working'); startPhraseTicker(); setInputBusy(true); } else { s.classList.remove('chassis-working'); stopPhraseTicker(); s.textContent = ' ready'; setInputBusy(false); } }
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
      if (msg.type === 'preview-ready' && window.__chassisPreviewSetReady) { window.__chassisPreviewSetReady(msg.port); }
      if (msg.type === 'preview-error' && window.__chassisPreviewSetError) { window.__chassisPreviewSetError(msg.message || 'Could not start server.'); }
      if (msg.type === 'update-agent-badge') {
        window._agentMode = !!msg.agentMode;
        const badgeEl = document.querySelector('.badge.mode[data-action="show-agent-info"]');
        if (badgeEl && msg.html) { badgeEl.outerHTML = msg.html; }
      }
    });
  `;
}
