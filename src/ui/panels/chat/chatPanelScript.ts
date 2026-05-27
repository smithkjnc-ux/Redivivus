// [SCOPE] Chat Panel Webview Script — all client-side JS injected into the chat webview
// Extracted from chatPanelHtml.ts (was lines 406-1008). Keep under 200 lines.
// [WARN] This is a template literal — JS inside uses single-quoted strings. Never use \n in string literals.

import { buildProjectsScript } from './chatPanelScriptProjects';
import { buildTemplatesScript } from './chatPanelScriptTemplates';
import { buildInterviewScript } from './chatPanelScriptInterview';
import { buildActionsScript } from './chatPanelScriptActions';
import { buildActionsScriptB } from './chatPanelScriptActionsB';
import { buildGatesScript } from './chatPanelScriptGates';
import { buildExpandedInterviewScript } from './chatPanelScriptExpandedInterview';
import { buildImageScript } from './chatPanelScriptImage';
import { buildListenerScript } from './chatPanelScriptListener';
import { buildPreviewScript } from './chatPanelPreviewScript';
import { buildVEScript } from './chatPanelVisualEditorScript';

export function buildChatScript(): string {
  return `
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('message-input');
    const conv = document.getElementById('conversation');
    const clearBtn = document.getElementById('clear-btn');
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
        if (sendBtn) { sendBtn.disabled = true; sendBtn.style.opacity = '0.4'; sendBtn.style.cursor = 'not-allowed'; sendBtn.dataset.icon = sendBtn.innerHTML; sendBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: redivivusSpin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>'; }
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
      const sub = document.createElement('div'); sub.style.cssText = 'font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:16px;'; sub.textContent = 'Redivivus needs to know how you want to work.'; wrap.appendChild(sub);
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
    clearBtn.addEventListener('click', () => vscode.postMessage({ type: 'clear-chat' }));
    // [DEAD] ID-based listeners for save-point-btn, map-btn, blueprint-btn removed --
    // those element IDs no longer exist; all header buttons now use data-cmd (handled above).

    function showGettingStarted() {
      if (document.getElementById('getting-started')) return;
      const header = document.querySelector('.header');
      if (!header) return;
      header.insertAdjacentHTML('afterend', '<div id="getting-started"><div class="gs-header"><span class="gs-title">Getting Started with Redivivus</span><button class="gs-close" id="gs-close">x</button></div><div class="gs-content"><div class="gs-section"><h3>What is Redivivus?</h3><p>Redivivus is your AI coding organizer.</p></div><div class="gs-section"><h3>Quick Start</h3><ol><li><strong>New Project:</strong> Click New Project in the sidebar</li><li><strong>Blueprint:</strong> Answer questions to create your project blueprint</li></ol></div></div></div>');
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
      stopPhraseTicker(); 
      const statusEl = document.getElementById('redivivus-status'); 
      const previewEl = document.getElementById('preview-chat-last');
      if (!statusEl && !previewEl) return;
      _phraseInterval = setInterval(() => {
        const phrase = _phrases[Math.floor(Math.random()*_phrases.length)];
        if (statusEl) statusEl.textContent = ' ' + phrase;
        if (previewEl) previewEl.textContent = '⏳ ' + phrase;
      }, 2800);
    }
    function stopPhraseTicker() { if(_phraseInterval){ clearInterval(_phraseInterval); _phraseInterval=null; } }

    ${buildVEScript()}
    ${buildListenerScript()}
    ${buildPreviewScript()}

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
