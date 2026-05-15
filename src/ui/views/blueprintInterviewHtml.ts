// [SCOPE] Blueprint Interview HTML Templates — small HTML fragments
// Extracted from blueprintInterviewPanel.ts
// [WARN] Template/data file — contains HTML string literals

export function buildInterviewHtml(nonce: string): string {
  return `
<div id="blueprint-interview" style="
  position:fixed;top:0;left:0;width:100%;height:100%;
  background:rgba(0,0,0,0.7);display:flex;align-items:center;
  justify-content:center;z-index:9999;font-family:inherit;">
  <div style="background:var(--vscode-editor-background);border:1px solid var(--vscode-focusBorder);
    border-radius:12px;width:90%;max-width:520px;max-height:85vh;display:flex;
    flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.6);">
    <div style="padding:18px 20px 12px;border-bottom:1px solid var(--vscode-editorGroup-border);flex-shrink:0;">
      <div style="font-size:15px;font-weight:700;color:var(--vscode-foreground);">🏗️ Blueprint Interview</div>
      <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:3px;" id="bi-subtitle">
        Let's build a real blueprint before writing a single line of code.
      </div>
      <div style="margin-top:10px;height:4px;background:var(--vscode-editorGroup-border);border-radius:2px;">
        <div id="bi-progress" style="height:100%;background:#4a9eff;border-radius:2px;width:0%;transition:width 0.3s;"></div>
      </div>
      <div style="font-size:10px;color:var(--vscode-descriptionForeground);margin-top:4px;" id="bi-progress-label">Layer 0 of 0</div>
    </div>
    <div id="bi-body" style="flex:1;overflow-y:auto;padding:20px;"></div>
    <div id="bi-footer" style="padding:12px 20px;border-top:1px solid var(--vscode-editorGroup-border);
      display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;">
      <button id="bi-skip" style="background:none;border:1px solid var(--vscode-input-border);
        color:var(--vscode-descriptionForeground);padding:7px 14px;border-radius:6px;cursor:pointer;font-size:12px;">
        Skip this layer
      </button>
      <button id="bi-next" style="background:#4a9eff;border:none;color:#0f0f1a;
        padding:7px 18px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">
        Next →
      </button>
    </div>
  </div>
</div>`;
}

export function buildBlueprintViewHtml(content: string, nonce: string): string {
  const safe = content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blueprint</title>
<style>
  body { margin:0; padding:0; background:var(--vscode-editor-background); color:var(--vscode-foreground); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; display:flex; flex-direction:column; height:100vh; overflow:hidden; }
  #bp-header { padding:16px 32px 12px; border-bottom:1px solid var(--vscode-editorGroup-border); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
  #bp-scroll { flex:1; overflow-y:auto; padding:24px 32px; }
  pre { white-space:pre-wrap; word-break:break-word; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; line-height:1.7; margin:0; }
  #redo-btn { background:#a855f7; border:none; color:#fff; padding:10px 24px; border-radius:6px; cursor:pointer; font-size:14px; font-weight:700; }
</style>
</head><body>
<div id="bp-header">
  <div style="display:flex;align-items:center;gap:12px;">
    <span style="font-size:24px;">🏗️</span>
    <div>
      <div style="font-size:18px;font-weight:700;">Your Blueprint</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);">Saved to .chassis/blueprint.md</div>
    </div>
  </div>
  <button id="redo-btn">Redo Interview &rarr;</button>
</div>
<div id="bp-scroll"><pre>${safe}</pre></div>
<script nonce="${nonce}">
(function() {
  const vscode = acquireVsCodeApi();
  document.getElementById('redo-btn').onclick = () => vscode.postMessage({ type: 'bi-redo' });
})();
<\/script>
</body></html>`;
}
