// [SCOPE] Chat Panel Webview Script — all client-side JS injected into the chat webview
// Extracted from chatPanelHtml.ts (was lines 406-1008). Keep under 200 lines.
// [WARN] This is a template literal — JS inside uses single-quoted strings. Never use \n in string literals.

import { buildProjectsScript } from './chatPanelScriptProjects.js';
import { buildTemplatesScript } from './chatPanelScriptTemplates.js';
import { buildInterviewScript } from './chatPanelScriptInterview.js';
import { buildActionsScript } from './chatPanelScriptActions.js';

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

    function doSend() {
      const text = input.value;
      if (text.trim()) {
        vscode.postMessage({ type: 'send-message', text });
        input.value = '';
        input.style.height = 'auto';
      }
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
    if (sendBtn) sendBtn.addEventListener('click', doSend);
    clearBtn.addEventListener('click', () => vscode.postMessage({ type: 'clear-chat' }));
    const savePointBtn = document.getElementById('save-point-btn');
    if (savePointBtn) savePointBtn.addEventListener('click', () => vscode.postMessage({ type: 'save-point' }));
    const mapBtn = document.getElementById('map-btn');
    if (mapBtn) mapBtn.addEventListener('click', () => vscode.postMessage({ type: 'run-command', command: 'chassis.showMap' }));
    const blueprintBtn = document.getElementById('blueprint-btn');
    if (blueprintBtn) blueprintBtn.addEventListener('click', () => vscode.postMessage({ type: 'run-command', command: 'chassis.blueprintInterview' }));

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
      if (msg.type === 'browse-result') { const pi = document.getElementById('np-folder-path'); if (pi && msg.folderPath) pi.value = msg.folderPath; }
      if (msg.type === 'show-panel') {
        if (msg.panelType === 'getting-started') showGettingStarted();
        else if (msg.panelType === 'start-session') showStartSessionPanel();
        else if (msg.panelType === 'new-project') showNewProjectPanel(msg.suggestedParent, msg.prefillTask, !!msg.compact, !!msg.vaultOnly, msg.prefillAnswers);
        else if (msg.panelType === 'create-folder') showCreateFolderPanel(msg.prefillName, msg.pendingTask);
        else showContentPanel(msg.title, msg.content);
      }
      if (msg.type === 'inject-text' && input && msg.text) { input.value = msg.text; input.focus(); }
      if (msg.type === 'bi-start') showBlueprintInterview();
      if (msg.type === 'bi-layers') { window._biLayers = msg.layers || []; window._biLayerIdx = 0; window._biRender(window._biLayers[0]); }
      if (msg.type === 'bi-done') { document.getElementById('blueprint-interview-root')?.remove(); document.body.style.overflow = ''; }
      if (msg.type === 'show-projects-modal') showProjectsModal(msg.projects);
      if (msg.type === 'show-template-wizard') showTemplateWizard(msg);
    });

    ${buildProjectsScript()}
    ${buildTemplatesScript()}
    ${buildInterviewScript()}
    ${buildActionsScript()}
  `;
}
