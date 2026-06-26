// [SCOPE] Chat Panel Webview Script — all client-side JS injected into the chat webview
// Extracted from chatPanelHtml.ts (was lines 406-1008). Keep under 200 lines.
// [WARN] This is a template literal — JS inside uses single-quoted strings. Never use \n in string literals.

import { buildProjectsScript } from './chatPanelScriptProjects.js';
import { buildTemplatesScript } from './chatPanelScriptTemplates.js';
import { buildInterviewScript } from './chatPanelScriptInterview.js';
import { buildActionsScript } from './chatPanelScriptActions.js';
import { buildActionsScriptB } from './chatPanelScriptActionsB.js';
import { buildGatesScript } from './chatPanelScriptGates.js';
import { buildTierScript } from './chatPanelScriptTier.js';
import { buildRoutingScript } from './chatPanelScriptRouting.js';
import { buildExpandedInterviewScript } from './chatPanelScriptExpandedInterview.js';
import { buildImageScript } from './chatPanelScriptImage.js';
import { buildListenerScript } from './chatPanelScriptListener.js';
import { buildPreviewScript } from './chatPanelPreviewScript.js';
import { buildVEScript } from './chatPanelVisualEditorScript.js';
import { buildBlueprintCardScript } from './chatPanelScriptBlueprintCard.js';
import { buildPanelsScript } from './chatPanelScriptPanels.js';
import { buildBehaviorPanelScript } from './chatPanelScriptBehaviorPanel.js';
import { buildBehaviorPopoverScript } from './chatPanelScriptBehaviorPopover.js';

export function buildChatScript(): string {
  return `
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('message-input');
    const conv = document.getElementById('conversation');
    // [FIX] clearBtn captured via getElementById breaks after panelRefresh replaces #header-right innerHTML
    // (the old element is detached; the new #clear-btn never gets the listener). Use document-level delegation
    // so it works regardless of how many times the header is surgically re-rendered. See chatPanelHeaderRender.ts.
    const sendBtn = document.getElementById('send-btn');
    input.focus();
    function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; }
    input.addEventListener('input', autoGrow);
    // [Redivivus] Build mode: 'plan' | 'direct' | undefined. Set by user via toggle or popover.
    window._buildMode = window._buildMode || undefined;
    var _pendingSendText = null;
    function setInputBusy(busy) {
      if (busy) {
        input.disabled = true; input.style.opacity = '0.5';
        if (sendBtn && !sendBtn.disabled) { sendBtn.disabled = true; sendBtn.style.opacity = '1'; sendBtn.style.cursor = 'wait'; sendBtn.dataset.icon = sendBtn.innerHTML; sendBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="animation: redivivus-spin 0.8s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>'; }
      } else {
        input.disabled = false; input.style.opacity = '1'; input.focus();
        if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = '1'; sendBtn.style.cursor = 'pointer'; sendBtn.innerHTML = sendBtn.dataset.icon || '&#9654;'; }
      }
    }
    function doSend() {
      const text = input.value;
      if (!text.trim() && !window._pendingImage) { return; }
      setInputBusy(true);
      // [FIX] Hide preview overlay so user can see the chat conversation unfold
      if (window.__redivivusPreviewHide) { window.__redivivusPreviewHide(); }
      var _tier = (window._getActiveTier && window._getActiveTier()) || undefined;
      var _manual = (window._getManualProvider && window._getManualProvider()) || undefined;
      var _manualModel = (window._getManualModel && window._getManualModel()) || undefined;
      vscode.postMessage({ type: 'send-message', text, mode: window._buildMode || undefined, imageBase64: window._pendingImage || undefined, imageType: window._pendingImageType || undefined, tier: _tier, manualProvider: _manual || undefined, manualModel: _manualModel, routingOverrides: (window._getRoutingOverrides ? window._getRoutingOverrides() : undefined) });
      input.value = ''; input.style.height = 'auto'; window._pendingImage = null; window._pendingImageType = null;
      const _ip = document.getElementById('img-prev'); if (_ip) _ip.remove();
      const _ipc = document.getElementById('img-preview-container'); if (_ipc) _ipc.remove();
      // Reset pill to neutral after send
      if (window._renderTierBadge) { window._renderTierBadge(); }
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
    if (sendBtn) sendBtn.addEventListener('click', doSend);
    // [FIX] Stop the send-button spinner when the extension reports the turn finished (success or error).
    window.addEventListener('message', (e) => { if (e && e.data && e.data.type === 'turn-done') { setInputBusy(false); } });

    ${buildPanelsScript()}

    // Mode toggle buttons from empty state + mode indicator pill clicks
    // [FIX] Also handles launcher buttons (start-new-project, open-existing-project)
    // so they work even if buildActionsScript listener fails to fire.
    document.addEventListener('click', (e) => {
      const el = (e.target && e.target.nodeType === 3) ? e.target.parentNode : e.target;
      if (!el || !el.closest) return;

      const target = el.closest('[data-action="set-mode"]');
      if (target) {
        const mode = target.getAttribute('data-mode');
        if (mode) { window._buildMode = mode; vscode.postMessage({ type: 'set-mode', mode }); input.focus(); }
        return;
      }
      const switchTarget = el.closest('[data-action="switch-mode"]');
      if (switchTarget) {
        const nextMode = window._buildMode === 'plan' ? 'direct' : 'plan';
        window._buildMode = nextMode;
        vscode.postMessage({ type: 'switch-mode', mode: nextMode });
        return;
      }
      const agentTarget = el.closest('[data-action="show-agent-info"]');
      if (agentTarget) {
        showAgentInfoPanel();
        return;
      }
      // Generic data-cmd handler: header buttons, sidebar pills, onboarding pills
      // [FIX] All button/pill elements use data-cmd — previous ID-based handlers (map-btn, blueprint-btn)
      // referenced elements that no longer exist. All header buttons were silently dead.
      const cmdEl = el.closest('[data-cmd]');
      if (cmdEl) {
        const cmd = cmdEl.getAttribute('data-cmd');
        if (cmd) { try { vscode.postMessage({ type: 'run-command', command: cmd }); } catch(err) {} }
        return;
      }
      // Launcher buttons: Start New Project (Plan It Out / Just Build) and Open Existing
      const launcherBtn = el.closest('[data-action]');
      if (launcherBtn) {
        const action = launcherBtn.getAttribute('data-action');
        if (action === 'start-new-project') {
          const mode = launcherBtn.getAttribute('data-mode');
          const assistMode = launcherBtn.getAttribute('data-assist') === 'true';
          try { vscode.postMessage({ type: 'start-new-project', mode: mode || undefined, assistMode }); } catch(err) {}
          return;
        }
        if (action === 'open-existing-project') { alert("Open Project button clicked!"); 
          try { vscode.postMessage({ type: 'open-existing-project' }); } catch(err) {}
          return;
        }
        if (action === 'retrofit-project') {
          try { vscode.postMessage({ type: 'retrofit-project' }); } catch(err) {}
          return;
        }
        if (action === 'scaffold-quickstart') { var tpl = launcherBtn.getAttribute('data-template'); if (tpl) { try { vscode.postMessage({ type: 'scaffold-quickstart', template: tpl }); } catch(err) {} } return; }
        if (action === 'toggle-auto-open-popover') { var pop = document.getElementById('launcher-auto-popover'); if (pop) { pop.style.display = pop.style.display === 'none' ? 'block' : 'none'; } return; }
      }
    });
    document.addEventListener('click', function(e) { var t = e.target; if (t && t.closest && t.closest('#clear-btn')) { vscode.postMessage({ type: 'clear-chat' }); } });
    // [DEAD] ID-based listeners for save-point-btn, map-btn, blueprint-btn removed --
    // those element IDs no longer exist; all header buttons now use data-cmd (handled above).

    ${buildVEScript()}
    ${buildListenerScript()}
    ${buildPreviewScript()}

    ${buildProjectsScript()}
    ${buildTemplatesScript()}
    ${buildInterviewScript()}
    ${buildActionsScript()}
    ${buildActionsScriptB()}
    ${buildBlueprintCardScript()}
    ${buildGatesScript()}
    ${buildExpandedInterviewScript()}
    ${buildImageScript()}
    ${buildTierScript()}
    ${buildRoutingScript()}
    ${buildBehaviorPanelScript()}
    ${buildBehaviorPopoverScript()}
  `;
}
