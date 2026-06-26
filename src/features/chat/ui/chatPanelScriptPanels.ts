// [SCOPE] Chat Panel Webview Script — showModePopover, showGettingStarted, showStartSessionPanel,
// showContentPanel, and phrase ticker. Extracted from chatPanelScript.ts (Rule 9 split).

export function buildPanelsScript(): string {
  return `
    function showModePopover(pendingText) {
      const existing = document.getElementById('mode-popover'); if (existing) existing.remove();
      const wrap = document.createElement('div'); wrap.id = 'mode-popover'; wrap.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--vscode-editor-background);color:var(--vscode-foreground);border:1px solid var(--vscode-focusBorder);border-radius:8px;padding:16px 20px;box-shadow:0 8px 32px rgba(0,0,0,0.35);z-index:9999;font-family:sans-serif;min-width:280px;text-align:center;';
      const title = document.createElement('div'); title.style.cssText = 'font-size:14px;font-weight:600;margin-bottom:6px;'; title.textContent = 'How do you want to work?'; wrap.appendChild(title);
      const sub = document.createElement('div'); sub.style.cssText = 'font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:16px;'; sub.textContent = 'You can change this anytime from the mode badge in the header.'; wrap.appendChild(sub);
      const btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:10px;justify-content:center;';
      const planBtn = document.createElement('button'); planBtn.style.cssText = 'padding:10px 18px;border:1px solid var(--vscode-input-border);border-radius:6px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);cursor:pointer;font-size:13px;font-weight:600;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:130px;';
      planBtn.innerHTML = '<span>Guided</span><span style="font-size:10px;font-weight:400;opacity:0.8;">5 W\\'s interview first</span>';
      planBtn.addEventListener('click', () => { wrap.remove(); window._buildMode = 'plan'; vscode.postMessage({ type: 'set-mode', mode: 'plan' }); if (_pendingSendText) { vscode.postMessage({ type: 'send-message', text: _pendingSendText, mode: 'plan' }); _pendingSendText = null; input.value = ''; input.style.height = 'auto'; } });
      btns.appendChild(planBtn);
      const directBtn = document.createElement('button'); directBtn.style.cssText = 'padding:10px 18px;border:none;border-radius:6px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);cursor:pointer;font-size:13px;font-weight:600;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:130px;';
      directBtn.innerHTML = '<span>Auto</span><span style="font-size:10px;font-weight:400;opacity:0.8;">AI decides, builds now</span>';
      directBtn.addEventListener('click', () => { wrap.remove(); window._buildMode = 'direct'; vscode.postMessage({ type: 'set-mode', mode: 'direct' }); if (_pendingSendText) { vscode.postMessage({ type: 'send-message', text: _pendingSendText, mode: 'direct' }); _pendingSendText = null; input.value = ''; input.style.height = 'auto'; } });
      btns.appendChild(directBtn);
      wrap.appendChild(btns);
      document.body.appendChild(wrap);
    }

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
      const conv = document.getElementById('conversation');
      _phraseInterval = setInterval(() => {
        const phrase = _phrases[Math.floor(Math.random()*_phrases.length)];
        if (statusEl) statusEl.textContent = ' ' + phrase;
        if (previewEl) previewEl.textContent = phrase;
        if (conv) {
          const buildBubble = conv.querySelector('.msg-assistant:last-child');
          if (buildBubble && buildBubble.textContent && buildBubble.textContent.indexOf('Building') !== -1) {
            buildBubble.textContent = '⚙️ ' + phrase;
          }
        }
      }, 2800);
    }
    function stopPhraseTicker() { if(_phraseInterval){ clearInterval(_phraseInterval); _phraseInterval=null; } }
  `;
}
