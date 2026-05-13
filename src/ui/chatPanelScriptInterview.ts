// [SCOPE] Chat Panel Webview Script — Blueprint Interview
// Extracted from chatPanelScript.ts. Keep under 200 lines.

export function buildInterviewScript(): string {
  return `
    function showBlueprintInterview() {
      if (!document.getElementById('blueprint-interview-root')) {
        const div = document.createElement('div'); div.id = 'blueprint-interview-root';
        div.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;background:var(--vscode-editor-background);display:flex;flex-direction:column;z-index:99999;font-family:inherit;overflow-y:auto;';
        div.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid var(--vscode-editorGroup-border);flex-shrink:0;">'
          + '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:18px;">🏗️</span><div><div style="font-size:14px;font-weight:700;color:var(--vscode-foreground);">Blueprint Interview</div><div style="font-size:11px;color:var(--vscode-descriptionForeground);" id="bi-subtitle">Building your project blueprint.</div></div></div>'
          + '<button id="bi-close-x" style="background:none;border:none;color:var(--vscode-descriptionForeground);cursor:pointer;font-size:20px;padding:2px 6px;line-height:1;border-radius:4px;" title="Close">&#x2715;</button></div>'
          + '<div style="padding:8px 20px 4px;"><div style="height:6px;background:var(--vscode-editorGroup-border);border-radius:3px;overflow:hidden;"><div id="bi-progress" style="height:100%;background:#a855f7;border-radius:3px;width:5%;transition:width 0.4s;"></div></div><div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:5px;text-align:center;" id="bi-progress-label">Starting...</div></div>'
          + '<div id="bi-body" style="flex:1;padding:10px 10px 10px 10px;overflow-y:auto;box-sizing:border-box;"></div>'
          + '<div style="padding:14px 20px;border-top:1px solid var(--vscode-editorGroup-border);display:flex;gap:10px;justify-content:flex-end;flex-shrink:0;">'
          + '<button id="bi-skip" style="background:none;border:1px solid var(--vscode-input-border);color:var(--vscode-descriptionForeground);padding:9px 18px;border-radius:6px;cursor:pointer;font-size:13px;">Skip layer</button>'
          + '<button id="bi-next" style="background:#a855f7;border:none;color:#fff;padding:9px 24px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;">Next &#8594;</button></div>';
        document.body.appendChild(div); document.body.style.overflow = 'hidden';
        window._biLayers = []; window._biLayerIdx = 0; window._biSpec = { projectType: 'unknown', layers: {} };
        document.getElementById('bi-close-x').onclick = () => { div.remove(); document.body.style.overflow=''; };
        document.getElementById('bi-next').onclick = () => window._biNext();
        document.getElementById('bi-skip').onclick = () => window._biSkip();
      }
      vscode.postMessage({ type: 'bi-start' });
    }

    window._biRender = function(layer) {
      const body=document.getElementById('bi-body'),prog=document.getElementById('bi-progress'),label=document.getElementById('bi-progress-label'),sub=document.getElementById('bi-subtitle');
      if(!body)return;
      const total=window._biLayers.length,idx=window._biLayerIdx;
      if(prog)prog.style.width=Math.round((idx/Math.max(total,1))*100)+'%';
      if(label)label.textContent='Layer '+(idx+1)+' of '+total+' — '+(layer.emoji||'')+' '+layer.name;
      if(sub)sub.textContent=(layer.emoji||'')+' '+layer.name;
      let html='<div style="display:flex;flex-direction:column;gap:14px;width:100%;box-sizing:border-box;">';
      (layer.questions||[]).forEach(q=>{
        html+='<div style="padding-bottom:16px;border-bottom:1px solid var(--vscode-editorGroup-border);"><div style="font-size:13px;font-weight:600;color:var(--vscode-foreground);margin-bottom:4px;">'+(!q.required?'<span style="font-size:10px;color:var(--vscode-descriptionForeground);margin-right:5px;font-weight:400;">(optional)</span>':'')+q.text+'</div>';
        html+='<div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:8px;line-height:1.5;">'+q.hint+'</div>';
        if(q.type==='choice'&&q.choices){
          html+='<div style="display:flex;flex-direction:column;gap:6px;" id="q-'+q.id+'">';
          q.choices.forEach(c=>{const safe=c.replace(/"/g,'&quot;');html+='<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;border:1px solid var(--vscode-input-border);cursor:pointer;font-size:13px;line-height:1.4;box-sizing:border-box;width:100%;"><input type="radio" name="q-'+q.id+'" value="'+safe+'" style="accent-color:#a855f7;width:16px;height:16px;flex-shrink:0;"> '+c+'</label>';});
          html+='</div>';
        } else { html+='<textarea id="q-'+q.id+'" rows="5" style="display:block;width:100%;box-sizing:border-box;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);color:var(--vscode-foreground);border-radius:6px;padding:8px 10px;font-size:13px;line-height:1.6;resize:vertical;font-family:inherit;min-height:110px;" placeholder="'+q.hint+'"></textarea>'; }
        html+='</div>';
      });
      body.innerHTML=html+'</div>'; body.scrollTop=0;
    };
    window._biCollect = function(layer) {
      if(!window._biSpec.layers[layer.id])window._biSpec.layers[layer.id]={};
      (layer.questions||[]).forEach(q=>{
        if(q.type==='choice'){const sel=document.querySelector('input[name="q-'+q.id+'"]:checked');if(sel)window._biSpec.layers[layer.id][q.id]=sel.value;}
        else{const el=document.getElementById('q-'+q.id);if(el&&el.value.trim())window._biSpec.layers[layer.id][q.id]=el.value.trim();}
      });
      if(layer.id==='foundation'){vscode.postMessage({type:'bi-detect-type',what:window._biSpec.layers.foundation?.what||'',where:window._biSpec.layers.foundation?.where||''});}
    };
    window._biAdvance = function(collect) {
      const layers=window._biLayers,idx=window._biLayerIdx;
      if(collect&&layers[idx])window._biCollect(layers[idx]);
      window._biLayerIdx=idx+1;
      if(window._biLayerIdx<layers.length)window._biRender(layers[window._biLayerIdx]);
      else vscode.postMessage({type:'bi-submit',spec:window._biSpec});
    };
    window._biNext = function() { window._biAdvance(true); };
    window._biSkip = function() { window._biAdvance(false); };
  `;
}
