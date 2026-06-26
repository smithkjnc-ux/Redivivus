// [SCOPE] Report Issue panel HTML. Script is served as external file via asWebviewUri — inline scripts
// are silently blocked by VSCodium's WebView CSP. See reportIssue.ts for script content + URI setup.

export function buildReportHtml(version: string, scriptUri: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{font-family:var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);margin:0;padding:20px;}
  h2{color:var(--vscode-textLink-foreground);margin-bottom:4px;font-size:16px;}
  .sub{color:var(--vscode-descriptionForeground);font-size:12px;margin-bottom:16px;}
  label{display:block;font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:4px;margin-top:12px;}
  select,textarea{width:100%;box-sizing:border-box;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,#555);border-radius:4px;padding:8px;font-size:13px;font-family:inherit;}
  select{height:32px;}
  textarea{resize:vertical;}
  #desc{height:100px;}
  #steps{height:70px;}
  .img-btn{margin-top:8px;padding:8px 16px;border:1px dashed var(--vscode-input-border,#555);border-radius:6px;background:transparent;color:var(--vscode-descriptionForeground);cursor:pointer;font-size:12px;font-family:inherit;width:100%;}
  .img-btn:hover{border-color:var(--vscode-textLink-foreground);color:var(--vscode-textLink-foreground);}
  .thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;}
  .thumb{position:relative;width:64px;height:64px;}
  .thumb img{width:64px;height:64px;object-fit:cover;border-radius:4px;border:1px solid var(--vscode-input-border,#555);}
  .thumb .rm{position:absolute;top:-4px;right:-4px;background:#c00;color:#fff;border:none;border-radius:50%;width:16px;height:16px;cursor:pointer;font-size:10px;padding:0;line-height:16px;}
  button.primary{margin-top:16px;width:100%;padding:10px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600;}
  button.primary:hover{background:var(--vscode-button-hoverBackground);}
  button.primary:disabled{opacity:0.5;cursor:default;}
  .status{margin-top:10px;font-size:12px;color:var(--vscode-descriptionForeground);text-align:center;min-height:16px;}
  .result{display:none;margin-top:20px;border-top:1px solid var(--vscode-input-border,#555);padding-top:16px;}
  .result.show{display:block;}
  .ok{background:#1a3a1a;border:1px solid #3a6a3a;border-radius:6px;padding:16px;font-size:14px;color:#7ec87e;}
  .ok-sub{font-size:11px;color:#5a9a5a;margin-top:8px;white-space:pre-line;line-height:1.6;}
  .err{background:#3a1a1a;border:1px solid #6a3a3a;border-radius:6px;padding:14px;font-size:13px;color:#e07070;}
  .close-btn{margin-top:12px;width:100%;padding:8px;border:1px solid var(--vscode-input-border,#555);border-radius:6px;background:transparent;color:var(--vscode-editor-foreground);cursor:pointer;font-size:13px;font-family:inherit;}
  .close-btn:hover{background:var(--vscode-button-background);color:var(--vscode-button-foreground);}
</style></head><body>
<h2>Report an Issue</h2>
<div class="sub">v${version} -- Sent to Redivivus admin at redivivus.dev</div>
<label>Type</label>
<select id="cat">
  <option>Bug</option>
  <option>Error / Crash</option>
  <option>UI Issue</option>
  <option>Build / AI Issue</option>
  <option>Feature Request</option>
  <option>Other</option>
</select>
<label>What happened?</label>
<textarea id="desc" placeholder="Describe what happened and what you expected..."></textarea>
<label>Steps to reproduce (optional)</label>
<textarea id="steps" placeholder="1. Opened a new project..."></textarea>
<label>Screenshots (optional)</label>
<button class="img-btn" id="pick-btn">+ Add Screenshots</button>
<div class="thumbs" id="thumbs"></div>
<label style="display:flex;align-items:center;gap:8px;margin-top:14px;cursor:pointer;">
  <input type="checkbox" id="include-logs" checked style="width:auto;margin:0;">
  <span>Include session logs <span style="color:var(--vscode-descriptionForeground);font-size:11px;">(helps diagnose the issue — last 150 log entries)</span></span>
</label>
<button class="primary" id="sub">Submit Report</button>
<div class="status" id="st"></div>
<div class="result" id="res">
  <div class="ok" id="ok-box" style="display:none;">Report sent to admin.<div class="ok-sub" id="ok-sub"></div></div>
  <div class="err" id="err-box" style="display:none;"></div>
  <button class="close-btn" id="close-btn" style="display:none;">Close</button>
</div>
<script src="${scriptUri}"></script>
</body></html>`;
}
