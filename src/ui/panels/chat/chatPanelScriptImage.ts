// [SCOPE] Webview script chunk — image paste/drop handler for chat input
// Intercepts Ctrl+V clipboard images, shows thumbnail preview, stores base64 for send.
// [RULE 13] ASCII only — no emoji, no Unicode in this template literal.

export function buildImageScript(): string {
  return `
    window._pendingImage = null;
    window._pendingImageType = null;
    function _showImagePreview(dataUrl, mime) {
      var prev = document.getElementById('img-prev'); if (prev) prev.remove();
      window._pendingImage = dataUrl.split(',')[1];
      window._pendingImageType = mime;
      
      var inpWrapper = document.getElementById('message-input').parentNode;
      var container = document.getElementById('img-preview-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'img-preview-container';
        container.style.cssText = 'display:flex;flex-wrap:wrap;padding:6px 12px 0 12px;gap:8px;';
        inpWrapper.insertBefore(container, document.getElementById('message-input'));
      }
      
      var wrap = document.createElement('div'); wrap.id = 'img-prev';
      wrap.style.cssText = 'display:inline-block;position:relative;';
      var img = document.createElement('img'); img.src = dataUrl;
      img.style.cssText = 'height:56px;width:56px;border-radius:6px;object-fit:cover;border:1px solid var(--vscode-input-border);box-shadow:0 2px 6px rgba(0,0,0,0.15);';
      
      var rm = document.createElement('button'); rm.innerHTML = '&times;'; rm.title = 'Remove image';
      rm.style.cssText = 'position:absolute;top:-6px;right:-6px;height:18px;width:18px;background:var(--vscode-editorError-foreground, #f87171);color:#fff;border:none;border-radius:50%;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;line-height:1;padding-bottom:2px;box-shadow:0 1px 4px rgba(0,0,0,0.3);';
      rm.addEventListener('click', function() { wrap.remove(); window._pendingImage = null; window._pendingImageType = null; });
      
      wrap.appendChild(img); wrap.appendChild(rm);
      container.appendChild(wrap);
    }
    document.addEventListener('paste', function(e) {
      var items = e.clipboardData ? e.clipboardData.items : [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') === 0) {
          e.preventDefault();
          var file = items[i].getAsFile(); if (!file) { break; }
          var mime = items[i].type;
          var reader = new FileReader();
          reader.onload = function(ev) { _showImagePreview(ev.target.result, mime); };
          reader.readAsDataURL(file); break;
        }
      }
    });
    document.addEventListener('dragover', function(e) {
      var hasImage = e.dataTransfer && Array.from(e.dataTransfer.items || []).some(function(it) { return it.type.indexOf('image') === 0; });
      if (hasImage) { e.preventDefault(); }
    });
    document.addEventListener('drop', function(e) {
      var files = e.dataTransfer ? e.dataTransfer.files : [];
      for (var i = 0; i < files.length; i++) {
        if (files[i].type.indexOf('image') === 0) {
          e.preventDefault();
          var mime = files[i].type;
          var reader = new FileReader();
          reader.onload = function(ev) { _showImagePreview(ev.target.result, mime); };
          reader.readAsDataURL(files[i]); break;
        }
      }
    });
  `;
}
