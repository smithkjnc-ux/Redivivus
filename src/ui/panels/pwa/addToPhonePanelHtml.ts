// [SCOPE] "Add to Phone" panel HTML/CSS/JS template. The finished PWA preview: shows BOTH the install URL and a QR
// code, a live countdown, copy/open actions, and Android/iPhone/Desktop install steps. ASCII-only injected script
// (Rule 13). See docs/REDIVIVUS_ADD_TO_PHONE.md.
import type { PublishResult } from '../../../services/pwa/pwaPublish.js';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// `svg` is the QR (generated server-side and trusted); everything else is escaped.
export function addToPhoneHtml(r: PublishResult, title: string, svg: string): string {
  const warn = r.warnings.length
    ? `<div class="warn">Heads up: ${r.warnings.length} local file(s) may not load when installed: ${esc(r.warnings.slice(0, 4).join(', '))}${r.warnings.length > 4 ? ' ...' : ''}</div>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style></head>
<body>
  <h2>Install <span class="hl">${esc(title)}</span> as an app</h2>
  <p class="sub">Works on phone, tablet, or computer. Scan the QR with a phone, or open the link on this machine.
     This install link expires in
     <b id="cd">--:--</b> &mdash; once installed, the app stays on the device, offline.</p>
  <div class="card">
    <div class="qr">${svg}</div>
    <div class="right">
      <div class="label">Install link</div>
      <code id="u" class="url">${esc(r.url)}</code>
      <div class="row"><button id="copy">Copy link</button><button id="open" class="primary">Open in browser</button></div>
    </div>
  </div>
  ${warn}
  <div class="steps">
    <h3>How to install</h3>
    <ul>
      <li><b>Android (Chrome):</b> open the link, then menu (three dots) &rarr; <b>Install app</b>.</li>
      <li><b>iPhone (Safari):</b> open the link, then <b>Share</b> &rarr; <b>Add to Home Screen</b>.</li>
      <li><b>Desktop (Chrome/Edge):</b> open the link, then the <b>Install</b> icon in the address bar.</li>
    </ul>
    <p class="hint">Tip: after it installs, turn off WiFi and launch the icon &mdash; it still runs (offline).</p>
  </div>
  <script>${js(r.expiresAt)}</script>
</body></html>`;
}

function js(expiresAt: number): string {
  return `(function(){
  var exp=${expiresAt}, cd=document.getElementById('cd');
  function tick(){var s=Math.max(0,Math.floor((exp-Date.now())/1000));
    if(s<=0){cd.textContent='expired';return;}
    cd.textContent=Math.floor(s/60)+':'+('0'+(s%60)).slice(-2);}
  tick(); setInterval(tick,1000);
  var vs=acquireVsCodeApi();
  document.getElementById('copy').onclick=function(){vs.postMessage({type:'copy'});};
  document.getElementById('open').onclick=function(){vs.postMessage({type:'open'});};
})();`;
}

const CSS = `
  body{font-family:system-ui,-apple-system,sans-serif;color:var(--vscode-foreground);padding:18px 22px;max-width:720px}
  h2{margin:.2em 0}.hl{color:var(--vscode-textLink-foreground)}
  .sub{opacity:.85;line-height:1.5;margin:.4em 0 1.2em}
  .card{display:flex;gap:20px;align-items:center;flex-wrap:wrap;background:var(--vscode-editorWidget-background);
    border:1px solid var(--vscode-widget-border,#0003);border-radius:10px;padding:16px}
  .qr{background:#fff;padding:8px;border-radius:8px;line-height:0}.qr svg{width:180px;height:180px;display:block}
  .right{flex:1;min-width:240px}.label{font-size:12px;opacity:.7;margin-bottom:4px}
  .url{display:block;word-break:break-all;background:var(--vscode-textCodeBlock-background,#0003);
    padding:8px 10px;border-radius:6px;font-size:12px;margin-bottom:10px}
  .row{display:flex;gap:8px}
  button{cursor:pointer;border:1px solid var(--vscode-button-border,transparent);border-radius:6px;padding:6px 12px;
    background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);font-size:13px}
  button.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
  .warn{margin:14px 0;padding:10px 12px;border-radius:8px;background:#7a5a0033;border:1px solid #c89a3a55;font-size:13px}
  .steps{margin-top:18px}.steps h3{margin:.2em 0}.steps ul{line-height:1.7;padding-left:18px}
  .hint{opacity:.7;font-size:13px}
`;
