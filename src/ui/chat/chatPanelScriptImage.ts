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
      var wrap = document.createElement('div'); wrap.id = 'img-prev';
      wrap.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 10px;background:rgba(255,255,255,0.05);border-radius:6px;margin-bottom:6px;border:1px solid var(--vscode-input-border);';
      var img = document.createElement('img'); img.src = dataUrl;
      img.style.cssText = 'max-height:56px;max-width:110px;border-radius:3px;object-fit:contain;';
      var lbl = document.createElement('span'); lbl.textContent = 'Screenshot attached -- AI will read it';
      lbl.style.cssText = 'font-size:11px;color:var(--vscode-descriptionForeground);flex:1;';
      var rm = document.createElement('button'); rm.textContent = 'x'; rm.title = 'Remove image';
      rm.style.cssText = 'background:none;border:none;color:var(--vscode-descriptionForeground);cursor:pointer;font-size:15px;padding:0 4px;line-height:1;';
      rm.addEventListener('click', function() { wrap.remove(); window._pendingImage = null; window._pendingImageType = null; });
      wrap.appendChild(img); wrap.appendChild(lbl); wrap.appendChild(rm);
      var inp = document.getElementById('message-input');
      if (inp && inp.parentNode) { inp.parentNode.insertBefore(wrap, inp); }
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
