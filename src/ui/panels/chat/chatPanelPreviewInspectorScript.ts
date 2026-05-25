// [SCOPE] Inspector overlay JS fragment — injected inside the preview IIFE by chatPanelPreviewScript.ts
// Depends on _inspectMode, _selectedEl, hidePreview() defined in the parent IIFE.

export function buildPreviewInspectorScript(): string {
  return `
  function toggleInspect() {
    var frame = document.getElementById('preview-frame');
    var btn = document.getElementById('preview-inspect-btn');
    _inspectMode = !_inspectMode;
    if (btn) { btn.style.borderColor = _inspectMode ? '#a78bfa' : ''; btn.style.color = _inspectMode ? '#a78bfa' : ''; }
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage({ type: _inspectMode ? 'redivivus-enable-inspect' : 'redivivus-disable-inspect' }, '*');
    }
  }

  function toggleRevealHidden() {
    var frame = document.getElementById('preview-frame');
    var btn = document.getElementById('preview-reveal-btn');
    var revealing = btn && btn.style.borderColor !== 'rgb(167, 139, 250)' && btn.style.borderColor !== '#a78bfa';
    if (btn) { btn.style.borderColor = revealing ? '#a78bfa' : ''; btn.style.color = revealing ? '#a78bfa' : ''; }
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage({ type: revealing ? 'redivivus-reveal-hidden' : 'redivivus-hide-revealed' }, '*');
    }
  }

  function handleElementSelected(data) {
    _inspectMode = false; _selectedEl = data;
    var btn = document.getElementById('preview-inspect-btn');
    if (btn) { btn.style.borderColor = ''; btn.style.color = ''; }
    var w = data.rect ? data.rect.width : '?', h = data.rect ? data.rect.height : '?';
    var tag = data.tagName + (data.id ? '#' + data.id : '') + (data.classes ? '.' + data.classes.split(' ').join('.') : '') + ' ' + w + 'x' + h;
    var tagEl = document.getElementById('inspector-el-tag');
    if (tagEl) { tagEl.textContent = tag; }
    var overlay = document.getElementById('inspector-overlay');
    if (overlay) { overlay.style.display = 'flex'; }
    var inp = document.getElementById('inspector-input');
    if (inp) { inp.value = ''; inp.focus(); }
  }

  function sendInspectorMessage() {
    var inp = document.getElementById('inspector-input');
    var text = inp ? inp.value.trim() : '';
    if (!text || !_selectedEl) { return; }
    var w = _selectedEl.rect ? _selectedEl.rect.width : '?', h = _selectedEl.rect ? _selectedEl.rect.height : '?';
    var ctx = '[' + _selectedEl.tagName + (_selectedEl.id ? '#' + _selectedEl.id : '') + (_selectedEl.classes ? '.' + _selectedEl.classes.split(' ').join('.') : '') + ' ' + w + 'x' + h + ']';
    closeInspectorOverlay(); hidePreview();
    var chatInput = document.getElementById('message-input');
    if (chatInput) { chatInput.value = ctx + '\\n' + text; chatInput.dispatchEvent(new Event('input')); }
    var sb = document.getElementById('send-btn');
    if (sb) { sb.click(); }
  }

  function closeInspectorOverlay() {
    var overlay = document.getElementById('inspector-overlay');
    if (overlay) { overlay.style.display = 'none'; }
    _selectedEl = null; _inspectMode = false;
    var btn = document.getElementById('preview-inspect-btn');
    if (btn) { btn.style.borderColor = ''; btn.style.color = ''; }
    var revBtn = document.getElementById('preview-reveal-btn');
    if (revBtn) { revBtn.style.borderColor = ''; revBtn.style.color = ''; }
  }

  window.addEventListener('message', function(e) {
    if (!e.data) { return; }
    if (e.data.type === 'redivivus-element-selected') { handleElementSelected(e.data); }
    if (e.data.type === 'redivivus-inspect-cancelled') { closeInspectorOverlay(); }
  });

  document.addEventListener('keydown', function(e) {
    var overlay = document.getElementById('inspector-overlay');
    if (e.key === 'Enter' && !e.shiftKey && e.target === document.getElementById('inspector-input')) {
      e.preventDefault(); sendInspectorMessage(); return;
    }
    if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') { closeInspectorOverlay(); }
  });
  `;
}
