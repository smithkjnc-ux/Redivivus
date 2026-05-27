// [SCOPE] Chat panel live preview JavaScript — absolute overlay toggle, device sizing, URL bar, pop-out
// Inspector overlay JS lives in chatPanelPreviewInspectorScript.ts (Rule 9 split).

import { buildPreviewInspectorScript } from './chatPanelPreviewInspectorScript';

export function buildPreviewScript(): string {
  return `
(function() {
  var _previewPort = null;
  var _inspectMode = false;
  var _selectedEl = null;
  var _lastDevice = 0;

  function showPreview() {
    var pv = document.getElementById('preview-view');
    if (!pv) { return; }
    pv.style.display = 'flex';
    document.querySelectorAll('.preview-device-btn').forEach(function(b) { b.classList.remove('active'); });
    var activeBtn = document.querySelector('.preview-device-btn[data-w="' + _lastDevice + '"]');
    if (activeBtn) { activeBtn.classList.add('active'); }
    setDevice(_lastDevice);
    var loading = document.getElementById('preview-loading');
    if (loading) { loading.style.display = 'flex'; loading.innerHTML = '<div class="preview-spinner"></div><span>Starting server…</span>'; }
    var frame = document.getElementById('preview-frame');
    if (frame) { frame.src = 'about:blank'; }
    var status = document.getElementById('preview-status');
    if (status) { status.textContent = ''; }
    var urlBar = document.getElementById('preview-url');
    if (urlBar) { urlBar.value = ''; }
    vscode.postMessage({ type: 'start-preview' });
  }

  function hidePreview() {
    var pv = document.getElementById('preview-view');
    if (pv) { pv.style.display = 'none'; }
  }

  function setPreviewReady(port) {
    _previewPort = port;
    var frame = document.getElementById('preview-frame');
    var loading = document.getElementById('preview-loading');
    var status = document.getElementById('preview-status');
    var urlBar = document.getElementById('preview-url');
    if (loading) { loading.style.display = 'none'; }
    if (status) { status.innerHTML = '<span style="color:#34d399;">&#9679;</span> live'; }
    if (urlBar) { urlBar.value = 'http://localhost:' + port; }
    if (frame) { frame.src = 'http://localhost:' + port; }
  }

  function setPreviewLoading(msg) {
    var loading = document.getElementById('preview-loading');
    if (loading) { loading.style.display = 'flex'; loading.innerHTML = '<div class="preview-spinner"></div><span>' + msg + '</span>'; }
  }

  function setPreviewError(msg) {
    var loading = document.getElementById('preview-loading');
    if (loading) {
      loading.style.display = 'flex';
      loading.innerHTML = '<span style="color:#f87171;font-size:13px;text-align:center;padding:0 16px;">&#9888; ' + msg + '</span>'
        + '<button data-action="preview-hide" style="margin-top:12px;padding:4px 14px;border:1px solid var(--c-border);border-radius:4px;background:none;color:var(--c-text);cursor:pointer;font-size:12px;">← Back to Chat</button>';
    }
    var status = document.getElementById('preview-status');
    if (status) { status.innerHTML = '<span style="color:#f87171;">&#9679;</span> error'; }
  }

  function setDevice(width) {
    var frame = document.getElementById('preview-frame');
    if (!frame) { return; }
    if (width === 0) {
      frame.style.width = '100%'; frame.style.boxShadow = 'none'; frame.style.borderRadius = '0';
    } else {
      var w = Math.min(width, window.innerWidth - 2);
      frame.style.width = w + 'px';
      frame.style.boxShadow = '0 0 0 1px var(--c-border), 0 4px 20px rgba(0,0,0,0.4)';
      frame.style.borderRadius = width === 390 ? '20px' : '4px';
    }
  }

  function refreshPreview() {
    var frame = document.getElementById('preview-frame');
    if (frame && _previewPort) {
      var cur = frame.src || '';
      var base = cur.split('?')[0].split('#')[0];
      if (!base || base === 'about:blank') { base = 'http://localhost:' + _previewPort; }
      frame.src = base + '?_t=' + Date.now();
      var urlBar = document.getElementById('preview-url');
      if (urlBar) { urlBar.value = base; }
    }
  }

  function popOut() { if (_previewPort) { vscode.postMessage({ type: 'popout-preview', port: _previewPort }); } }
  function openInBrowser() { if (_previewPort) { vscode.postMessage({ type: 'open-in-browser', port: _previewPort }); } }

  function sendPreviewChat() {
    var inp = document.getElementById('preview-chat-input');
    if (!inp) { return; }
    var text = (inp.value || '').trim();
    if (!text) { return; }
    // [FIX] Hide preview so user can see the chat response; update preview strip status
    hidePreview();
    var lastEl = document.getElementById('preview-chat-last');
    if (lastEl) { lastEl.textContent = '⏳ Asking Redivivus…'; }
    var btn = document.getElementById('preview-chat-send-btn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; }
    inp.value = '';
    vscode.postMessage({ type: 'send-message', text: text, fromPreview: true });
  }

  function showAndRefresh() {
    if (!_previewPort) { return; }
    var pv = document.getElementById('preview-view');
    if (pv && pv.style.display !== 'flex') {
      pv.style.display = 'flex';
      var loading = document.getElementById('preview-loading');
      if (loading) { loading.style.display = 'none'; }
    }
    refreshPreview();
  }

  window.__redivivusPreviewShow = showPreview;
  window.__redivivusPreviewHide = hidePreview;
  window.__redivivusPreviewSetReady = setPreviewReady;
  window.__redivivusPreviewSetLoading = setPreviewLoading;
  window.__redivivusPreviewSetError = setPreviewError;
  window.__redivivusPreviewRefresh = refreshPreview;
  window.__redivivusPreviewShowAndRefresh = showAndRefresh;
  window.__redivivusPreviewPopOut = popOut;
  window.__redivivusPreviewOpenBrowser = openInBrowser;

  ${buildPreviewInspectorScript()}

  document.addEventListener('click', function(e) {
    var el = e.target;
    if (!el || !el.closest) { return; }
    var deviceBtn = el.closest('.preview-device-btn');
    if (deviceBtn) {
      document.querySelectorAll('.preview-device-btn').forEach(function(b) { b.classList.remove('active'); });
      deviceBtn.classList.add('active');
      _lastDevice = parseInt(deviceBtn.getAttribute('data-w') || '0', 10);
      setDevice(_lastDevice);
      return;
    }
    var actionEl = el.closest('[data-action]');
    if (!actionEl) { return; }
    var action = actionEl.getAttribute('data-action');
    if (action === 'preview-show') { showPreview(); }
    else if (action === 'preview-hide') { hidePreview(); }
    else if (action === 'preview-refresh') { refreshPreview(); }
    else if (action === 'preview-browser') { openInBrowser(); }
    else if (action === 'preview-popout') { popOut(); }
    else if (action === 'preview-inspect') { toggleInspect(); }
    else if (action === 'preview-reveal') { toggleRevealHidden(); }
    else if (action === 'inspector-send') { sendInspectorMessage(); }
    else if (action === 'inspector-cancel') { closeInspectorOverlay(); }
    else if (action === 'preview-chat-send') { sendPreviewChat(); }
    else if (action === 'preview-revert') {
      var snapId = actionEl.getAttribute('data-snap');
      if (snapId) {
        vscode.postMessage({ type: 'undo-build', snapshotId: snapId });
        var rl = document.getElementById('preview-chat-last');
        if (rl) { rl.textContent = '⏳ Reverting…'; }
      }
    }
    else if (action === 'preview-save') {
      var sl = document.getElementById('preview-chat-last');
      if (sl) { sl.textContent = '📌 Saved — changes kept.'; }
    }
    else if (action === 've-toggle') {
      var vd = document.getElementById('ve-drawer');
      if (vd && vd.classList.contains('open')) { veClose(); }
      else { vscode.postMessage({ type: 've-open-request' }); }
    }
    else if (action === 'rearrange-toggle') {
      var mb = document.getElementById('preview-move-btn');
      if (mb && mb.classList.contains('active')) { vscode.postMessage({ type: 'rearrange-finish', snapId: window._rearrangeSnap }); }
      else { vscode.postMessage({ type: 'rearrange-start' }); }
    }
    else if (action === 'rearrange-undo') { vscode.postMessage({ type: 'rearrange-undo', snapId: window._rearrangeSnap }); }
    else if (action==='mv-up'||action==='mv-dn') { var mvf=document.getElementById('preview-frame'); if(mvf&&mvf.contentWindow)mvf.contentWindow.postMessage({type:'redivivus-key',key:action==='mv-up'?'ArrowUp':'ArrowDown'},'*'); }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey && e.target === document.getElementById('preview-chat-input')) {
      e.preventDefault(); sendPreviewChat(); return;
    }
    if (e.key !== 'Enter') { return; }
    var urlBar = document.getElementById('preview-url');
    if (e.target !== urlBar) { return; }
    var val = (urlBar.value || '').trim();
    if (!val) { return; }
    if (!val.startsWith('http')) {
      val = 'http://localhost:' + (_previewPort || '') + (val.startsWith('/') ? val : '/' + val);
    }
    var frame = document.getElementById('preview-frame');
    if (frame) { frame.src = val; }
  });
})();
  `;
}
