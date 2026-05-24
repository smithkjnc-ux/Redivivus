// [SCOPE] Chat panel live preview JavaScript — tab toggle, device sizing, pop-out

export function buildPreviewScript(): string {
  return `
(function() {
  var _previewPort = null;

  function showPreview() {
    document.getElementById('conversation').style.display = 'none';
    document.getElementById('input-area').style.display = 'none';
    var pv = document.getElementById('preview-view');
    if (pv) { pv.style.display = 'flex'; }
    var loading = document.getElementById('preview-loading');
    if (loading) { loading.style.display = 'flex'; }
    var frame = document.getElementById('preview-frame');
    if (frame) { frame.src = 'about:blank'; }
    var status = document.getElementById('preview-status');
    if (status) { status.textContent = 'Starting server...'; }
    vscode.postMessage({ type: 'start-preview' });
  }

  function hidePreview() {
    var pv = document.getElementById('preview-view');
    if (pv) { pv.style.display = 'none'; }
    document.getElementById('conversation').style.display = '';
    document.getElementById('input-area').style.display = '';
  }

  function setPreviewReady(port) {
    _previewPort = port;
    var frame = document.getElementById('preview-frame');
    var loading = document.getElementById('preview-loading');
    var status = document.getElementById('preview-status');
    if (loading) { loading.style.display = 'none'; }
    if (status) { status.innerHTML = '<span style="color:#34d399;">&#9679;</span> localhost:' + port; }
    if (frame) { frame.src = 'http://localhost:' + port; }
  }

  function setPreviewError(msg) {
    var loading = document.getElementById('preview-loading');
    if (loading) {
      loading.innerHTML = '<span style="color:#f87171;font-size:13px;">&#9888; ' + msg + '</span>'
        + '<button onclick="window.__chassisPreviewHide()" style="margin-top:10px;padding:4px 14px;border:1px solid #555;border-radius:4px;background:none;color:#e8edf8;cursor:pointer;font-size:12px;">← Back to Chat</button>';
    }
    var status = document.getElementById('preview-status');
    if (status) { status.textContent = 'Server error'; }
  }

  function setDevice(width) {
    var frame = document.getElementById('preview-frame');
    if (!frame) { return; }
    if (width === 0) {
      frame.style.width = '100%';
      frame.style.boxShadow = 'none';
    } else {
      var w = Math.min(width, window.innerWidth - 2);
      frame.style.width = w + 'px';
      frame.style.boxShadow = '0 0 0 1px var(--c-border)';
    }
  }

  function refreshPreview() {
    var frame = document.getElementById('preview-frame');
    if (frame && _previewPort) { frame.src = 'http://localhost:' + _previewPort + '?_t=' + Date.now(); }
  }

  function popOut() {
    if (_previewPort) { vscode.postMessage({ type: 'popout-preview', port: _previewPort }); }
  }

  window.__chassisPreviewShow = showPreview;
  window.__chassisPreviewHide = hidePreview;
  window.__chassisPreviewSetReady = setPreviewReady;
  window.__chassisPreviewSetError = setPreviewError;
  window.__chassisPreviewRefresh = refreshPreview;
  window.__chassisPreviewPopOut = popOut;

  document.addEventListener('click', function(e) {
    var btn = e.target && e.target.closest ? e.target.closest('.preview-device-btn') : null;
    if (!btn) { return; }
    document.querySelectorAll('.preview-device-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    setDevice(parseInt(btn.getAttribute('data-w') || '0', 10));
  });
})();
  `;
}
