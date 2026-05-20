// [SCOPE] Chat Panel Webview Script — all client-side JS injected into the chat webview
// Extracted from chatPanelHtml.ts (was lines 406-1008). Keep under 200 lines.
// [WARN] This is a template literal — JS inside uses single-quoted strings. Never use \n in string literals.

import { buildProjectsScript } from './chatPanelScriptProjects.js';
import { buildTemplatesScript } from './chatPanelScriptTemplates.js';
import { buildInterviewScript } from './chatPanelScriptInterview.js';
import { buildActionsScript } from './chatPanelScriptActions.js';
import { buildActionsScriptB } from './chatPanelScriptActionsB.js';
import { buildGatesScript } from './chatPanelScriptGates.js';
import { buildExpandedInterviewScript } from './chatPanelScriptExpandedInterview.js';
import { buildImageScript } from './chatPanelScriptImage.js';

export function buildChatScript(): string {
  return `
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('message-input');
    const conv = document.getElementById('conversation');
    const clearBtn = document.getElementById('clear-btn');
    const sendBtn = document.getElementById('send-btn');
    input.focus();

    function autoGrow() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    }
    input.addEventListener('input', autoGrow);

    // [CHASSIS] Build mode: 'plan' | 'direct' | undefined. Set by user via toggle or popover.
    window._buildMode = window._buildMode || undefined;
    var _pendingSendText = null;

    function doSend() {
      const text = input.value;
      if (!text.trim() && !window._pendingImage) { return; }
      vscode.postMessage({ type: 'send-message', text, mode: window._buildMode || undefined, imageBase64: window._pendingImage || undefined, imageType: window._pendingImageType || undefined });
      input.value = ''; input.style.height = 'auto'; window._pendingImage = null; window._pendingImageType = null;
      const _ip = document.getElementById('img-prev'); if (_ip) _ip.remove();
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
    if (sendBtn) sendBtn.addEventListener('click', doSend);

    function showModePopover(pendingText) {
      const existing = document.getElementById('mode-popover'); if (existing) existing.remove();
      const wrap = document.createElement('div'); wrap.id = 'mode-popover'; wrap.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--vscode-editor-background);color:var(--vscode-foreground);border:1px solid var(--vscode-focusBorder);border-radius:8px;padding:16px 20px;box-shadow:0 8px 32px rgba(0,0,0,0.35);z-index:9999;font-family:sans-serif;min-width:280px;text-align:center;';
      const title = document.createElement('div'); title.style.cssText = 'font-size:14px;font-weight:600;margin-bottom:12px;'; title.textContent = 'Choose your build approach'; wrap.appendChild(title);
      const sub = document.createElement('div'); sub.style.cssText = 'font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:16px;'; sub.textContent = 'CHASSIS needs to know how you want to work.'; wrap.appendChild(sub);
      const btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:10px;justify-content:center;';
      const planBtn = document.createElement('button'); planBtn.textContent = '📋 Plan It Out'; planBtn.style.cssText = 'padding:8px 16px;border:1px solid var(--vscode-input-border);border-radius:6px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);cursor:pointer;font-size:13px;font-weight:600;';
      planBtn.addEventListener('click', () => { wrap.remove(); window._buildMode = 'plan'; vscode.postMessage({ type: 'set-mode', mode: 'plan' }); if (_pendingSendText) { vscode.postMessage({ type: 'send-message', text: _pendingSendText, mode: 'plan' }); _pendingSendText = null; input.value = ''; input.style.height = 'auto'; } });
      btns.appendChild(planBtn);
      const directBtn = document.createElement('button'); directBtn.textContent = '⚡ Just Build'; directBtn.style.cssText = 'padding:8px 16px;border:none;border-radius:6px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);cursor:pointer;font-size:13px;font-weight:600;';
      directBtn.addEventListener('click', () => { wrap.remove(); window._buildMode = 'direct'; vscode.postMessage({ type: 'set-mode', mode: 'direct' }); if (_pendingSendText) { vscode.postMessage({ type: 'send-message', text: _pendingSendText, mode: 'direct' }); _pendingSendText = null; input.value = ''; input.style.height = 'auto'; } });
      btns.appendChild(directBtn);
      wrap.appendChild(btns);
      document.body.appendChild(wrap);
    }

    // Mode toggle buttons from empty state + mode indicator pill clicks
    // [FIX] Also handles launcher buttons (start-new-project, open-existing-project)
    // so they work even if buildActionsScript listener fails to fire.
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action="set-mode"]');
      if (target) {
        const mode = target.getAttribute('data-mode');
        if (mode) { window._buildMode = mode; vscode.postMessage({ type: 'set-mode', mode }); input.focus(); }
        return;
      }
      const switchTarget = e.target.closest('[data-action="switch-mode"]');
      if (switchTarget) {
        const nextMode = window._buildMode === 'plan' ? 'direct' : 'plan';
        window._buildMode = nextMode;
        vscode.postMessage({ type: 'switch-mode', mode: nextMode });
        return;
      }
      const agentTarget = e.target.closest('[data-action="toggle-agent-mode"]');
      if (agentTarget) {
        vscode.postMessage({ type: 'toggle-agent-mode' });
        const isAgent = agentTarget.textContent.includes('Agent Mode');
        if (isAgent) {
           agentTarget.textContent = '🚇 Pipeline';
           agentTarget.style.background = '#1f2937';
           agentTarget.style.color = '#9ca3af';
           agentTarget.style.borderColor = '#374151';
        } else {
           agentTarget.textContent = '🤖 Agent Mode';
           agentTarget.style.background = '#4c1d95';
           agentTarget.style.color = '#c4b5fd';
           agentTarget.style.borderColor = '#8b5cf6';
        }
        return;
      }
      // Generic data-cmd handler: header buttons, sidebar pills, onboarding pills
      // [FIX] All button/pill elements use data-cmd — previous ID-based handlers (map-btn, blueprint-btn)
      // referenced elements that no longer exist. All header buttons were silently dead.
      const cmdEl = e.target.closest ? e.target.closest('[data-cmd]') : null;
      if (cmdEl) {
        const cmd = cmdEl.getAttribute('data-cmd');
        if (cmd) { try { vscode.postMessage({ type: 'run-command', command: cmd }); } catch(err) {} }
        return;
      }
      // Launcher buttons: Start New Project (Plan It Out / Just Build) and Open Existing
      const launcherBtn = e.target.closest ? e.target.closest('[data-action]') : null;
      if (launcherBtn) {
        const action = launcherBtn.getAttribute('data-action');
        if (action === 'start-new-project') {
          const mode = launcherBtn.getAttribute('data-mode');
          const assistMode = launcherBtn.getAttribute('data-assist') === 'true';
          try { vscode.postMessage({ type: 'start-new-project', mode: mode || undefined, assistMode }); } catch(err) {}
          return;
        }
        if (action === 'open-existing-project') {
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
    clearBtn.addEventListener('click', () => vscode.postMessage({ type: 'clear-chat' }));
    // [DEAD] ID-based listeners for save-point-btn, map-btn, blueprint-btn removed --
    // those element IDs no longer exist; all header buttons now use data-cmd (handled above).

    function showGettingStarted() {
      if (document.getElementById('getting-started')) return;
      const header = document.querySelector('.header');
      if (!header) return;
      header.insertAdjacentHTML('afterend', '<div id="getting-started"><div class="gs-header"><span class="gs-title">Getting Started with CHASSIS</span><button class="gs-close" id="gs-close">x</button></div><div class="gs-content"><div class="gs-section"><h3>What is CHASSIS?</h3><p>CHASSIS is your AI coding organizer.</p></div><div class="gs-section"><h3>Quick Start</h3><ol><li><strong>New Project:</strong> Click New Project in the sidebar</li><li><strong>Blueprint:</strong> Answer questions to create your project blueprint</li></ol></div></div></div>');
      const gsClose = document.getElementById('gs-close');
      if (gsClose) gsClose.addEventListener('click', () => document.getElementById('getting-started')?.remove());
    }

    function showStartSessionPanel() {
      const existing = document.getElementById('ss-modal-overlay'); if(existing)existing.remove();
      const overlay=document.createElement('div'); overlay.id='ss-modal-overlay'; overlay.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
      const card=document.createElement('div'); card.style.cssText='background:#ffffff;color:#1e1e1e;border-radius:8px;padding:28px 32px;width:480px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.35);font-family:sans-serif;';
      const title=document.createElement('div'); title.style.cssText='font-size:17px;font-weight:600;margin-bottom:4px;'; title.textContent='Start Session'; card.appendChild(title);
      const gi=document.createElement('input'); gi.id='ss-goal'; gi.type='text'; gi.placeholder='Goal...'; gi.style.cssText='width:100%;padding:10px;border:1px solid #ccc;border-radius:5px;margin-bottom:16px;'; card.appendChild(gi); setTimeout(()=>gi.focus(),30);
      const btns=document.createElement('div'); btns.style.cssText='display:flex;justify-content:flex-end;gap:10px;';
      const cn=document.createElement('button'); cn.textContent='Cancel'; cn.onclick=()=>overlay.remove(); btns.appendChild(cn);
      const st=document.createElement('button'); st.textContent='Start'; st.onclick=()=>{ vscode.postMessage({type:'start-session',goal:gi.value}); overlay.remove(); };
      btns.appendChild(st); card.appendChild(btns); overlay.appendChild(card); document.body.appendChild(overlay);
    }

    function showContentPanel(title, content) {
      const existing=document.getElementById('dynamic-panel'); if(existing)existing.remove();
      const header=document.querySelector('.header'); if(!header)return;
      header.insertAdjacentHTML('afterend', '<div id="dynamic-panel" class="dynamic-panel"><div class="dp-header"><span class="dp-title">'+title+'</span><button class="dp-close" id="dp-close">x</button></div><div class="dp-content">'+content+'</div></div>');
      document.getElementById('dp-close')?.addEventListener('click',()=>document.getElementById('dynamic-panel')?.remove());
    }

    var _phraseInterval = null;
    var _phrases = ['torquing bolts...','checking clearances...','aligning tolerances...','reading the blueprint...','pressure testing...','calibrating sensors...','welding joints...','inspecting welds...','routing wiring...','load testing frame...'];
    function startPhraseTicker() {
      stopPhraseTicker(); const statusEl = document.getElementById('chassis-status'); if (!statusEl) return;
      _phraseInterval = setInterval(() => {
        statusEl.textContent = ' ' + _phrases[Math.floor(Math.random()*_phrases.length)];
      }, 2800);
    }
    function stopPhraseTicker() { if(_phraseInterval){ clearInterval(_phraseInterval); _phraseInterval=null; } }

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'refresh') location.reload();
      if (msg.type === 'update-conversation') { if (msg.html !== undefined) { conv.innerHTML = msg.html; conv.scrollTop = conv.scrollHeight; } return; }
      if (msg.type === 'set-status') {
        const s = document.getElementById('chassis-status');
        if (s) { if (msg.status === 'working') { s.classList.add('chassis-working'); startPhraseTicker(); } else { s.classList.remove('chassis-working'); stopPhraseTicker(); s.textContent = ' ready'; } }
      }
      if (msg.type === 'browse-result') {
        const pi = document.getElementById('np-folder-path');
        const ni = document.getElementById('np-name');
        if (pi && msg.folderPath) {
          const slug = ni ? (ni.value.trim() || 'my-project').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() : 'my-project';
          // [WARN] Regex in template literal: use [/] char class — /\/ collapses to // (comment) when template string is evaluated
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
    });

    ${buildProjectsScript()}
    ${buildTemplatesScript()}
    ${buildInterviewScript()}
    ${buildActionsScript()}
    ${buildActionsScriptB()}
    ${buildGatesScript()}
    ${buildExpandedInterviewScript()}
    ${buildImageScript()}
  `;
}
