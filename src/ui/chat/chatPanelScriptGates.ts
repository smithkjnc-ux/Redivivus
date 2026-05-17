// [SCOPE] Chat Panel Webview Script — Modals for Build Gates (Placement, Cost, Vault)
// Extracted to keep chatPanelScript under 200 lines.

export function buildGatesScript(): string {
  return `
    function showPlacementCheckPanel(placementId, projectName, noProject) {
      const existing = document.getElementById('gate-modal-overlay'); if(existing) existing.remove();
      const ov=document.createElement('div'); ov.id='gate-modal-overlay'; ov.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
      const cd=document.createElement('div'); cd.style.cssText='background:#1e2740;color:#e8edf8;border-radius:12px;padding:28px 32px;width:480px;max-width:90vw;box-shadow:0 12px 48px rgba(0,0,0,0.6);border:1px solid #2d3a55;font-family:inherit;';
      const tt=document.createElement('div'); tt.style.cssText='font-size:17px;font-weight:700;margin-bottom:12px;color:#e8edf8;'; 
      tt.textContent = noProject ? 'No Open Folder' : 'Build Placement Check'; 
      cd.appendChild(tt);
      
      const sub=document.createElement('div'); sub.style.cssText='font-size:13px;color:#8899bb;margin-bottom:24px;line-height:1.5;'; 
      if (noProject) {
        sub.innerHTML = 'You are trying to build a project, but <strong>no workspace folder is open</strong>. Do you want to create a new project folder?';
      } else {
        sub.innerHTML = 'You are asking to build a project, but you already have <strong>' + projectName + '</strong> open. Where should this be built?';
      }
      cd.appendChild(sub);
      
      const btns=document.createElement('div'); btns.style.cssText='display:flex;justify-content:flex-end;gap:12px;';
      
      const cn=document.createElement('button'); cn.textContent='Cancel Build'; cn.style.cssText='padding:8px 18px;border:1px solid #2d3a55;border-radius:8px;background:transparent;color:#8899bb;cursor:pointer;font-size:13px;'; 
      cn.addEventListener('click',() => { ov.remove(); vscode.postMessage({ type: 'placement-' + placementId, choice: 'cancel' }); }); 
      btns.appendChild(cn);

      if (!noProject) {
        const here=document.createElement('button'); here.textContent='Build Here'; here.style.cssText='padding:8px 18px;border:1px solid #4d9eff;border-radius:8px;background:transparent;color:#4d9eff;cursor:pointer;font-size:13px;font-weight:600;'; 
        here.addEventListener('click',() => { ov.remove(); vscode.postMessage({ type: 'placement-' + placementId, choice: 'here' }); }); 
        btns.appendChild(here);
      }
      
      const np=document.createElement('button'); np.textContent='Create New Project'; np.style.cssText='padding:8px 20px;border:none;border-radius:8px;background:linear-gradient(135deg,#2563eb,#4d9eff);color:#fff;cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 2px 10px rgba(77,158,255,0.3);'; 
      np.addEventListener('click',() => { ov.remove(); vscode.postMessage({ type: 'placement-' + placementId, choice: 'new-project' }); }); 
      btns.appendChild(np);
      
      cd.appendChild(btns); ov.appendChild(cd); document.body.appendChild(ov);
    }

    function showCostEstimatePanel(buildId, estimate) {
      const existing = document.getElementById('gate-modal-overlay'); if(existing) existing.remove();
      const ov=document.createElement('div'); ov.id='gate-modal-overlay'; ov.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
      const cd=document.createElement('div'); cd.style.cssText='background:#1e2740;color:#e8edf8;border-radius:12px;padding:28px 32px;width:400px;max-width:90vw;box-shadow:0 12px 48px rgba(0,0,0,0.6);border:1px solid #2d3a55;font-family:inherit;';
      
      const tt=document.createElement('div'); tt.style.cssText='font-size:17px;font-weight:700;margin-bottom:16px;color:#e8edf8;display:flex;align-items:center;gap:8px;'; 
      tt.innerHTML = '<span style="font-size:20px">\uD83D\uDCB8</span> Cost Estimate Warning'; 
      cd.appendChild(tt);
      
      const sub=document.createElement('div'); sub.style.cssText='font-size:13px;color:#8899bb;margin-bottom:20px;line-height:1.5;'; 
      sub.innerHTML = 'This is a complex build that will require multiple AI calls. Are you sure you want to proceed?';
      cd.appendChild(sub);

      const stats=document.createElement('div'); stats.style.cssText='background:#1a2035;border:1px solid #2d3a55;border-radius:8px;padding:16px;margin-bottom:24px;display:grid;grid-template-columns:1fr 1fr;gap:12px;';
      stats.innerHTML = 
        '<div style="display:flex;flex-direction:column;gap:4px;"><span style="font-size:11px;color:#8899bb;text-transform:uppercase;letter-spacing:0.5px;">Est. Cost</span><span style="font-size:18px;font-weight:700;color:#4ec959;">' + estimate.costFormatted + '</span></div>' +
        '<div style="display:flex;flex-direction:column;gap:4px;"><span style="font-size:11px;color:#8899bb;text-transform:uppercase;letter-spacing:0.5px;">Model</span><span style="font-size:14px;font-weight:600;color:#e8edf8;">' + estimate.modelLabel + '</span></div>' +
        '<div style="display:flex;flex-direction:column;gap:4px;"><span style="font-size:11px;color:#8899bb;text-transform:uppercase;letter-spacing:0.5px;">Phases</span><span style="font-size:14px;font-weight:600;color:#e8edf8;">' + estimate.phases + ' steps</span></div>' +
        '<div style="display:flex;flex-direction:column;gap:4px;"><span style="font-size:11px;color:#8899bb;text-transform:uppercase;letter-spacing:0.5px;">Tokens</span><span style="font-size:14px;font-weight:600;color:#e8edf8;">~' + (estimate.tokens/1000).toFixed(1) + 'k</span></div>';
      cd.appendChild(stats);
      
      const btns=document.createElement('div'); btns.style.cssText='display:flex;justify-content:flex-end;gap:12px;';
      
      const cn=document.createElement('button'); cn.textContent='Cancel'; cn.style.cssText='padding:8px 18px;border:1px solid #2d3a55;border-radius:8px;background:transparent;color:#8899bb;cursor:pointer;font-size:13px;'; 
      cn.addEventListener('click',() => { ov.remove(); vscode.postMessage({ type: 'confirm-build', buildId, confirmed: false }); }); 
      btns.appendChild(cn);

      const np=document.createElement('button'); np.textContent='Proceed with Build'; np.style.cssText='padding:8px 20px;border:none;border-radius:8px;background:linear-gradient(135deg,#2563eb,#4d9eff);color:#fff;cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 2px 10px rgba(77,158,255,0.3);'; 
      np.addEventListener('click',() => { ov.remove(); vscode.postMessage({ type: 'confirm-build', buildId, confirmed: true }); }); 
      btns.appendChild(np);
      
      cd.appendChild(btns); ov.appendChild(cd); document.body.appendChild(ov);
    }

    function showScopeModal(task) {
      const existing = document.getElementById('gate-modal-overlay'); if(existing) existing.remove();
      const ov=document.createElement('div'); ov.id='gate-modal-overlay'; ov.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;';
      const cd=document.createElement('div'); cd.style.cssText='background:#1e2740;color:#e8edf8;border-radius:12px;padding:28px 32px;width:480px;max-width:90vw;box-shadow:0 12px 48px rgba(0,0,0,0.6);border:1px solid #2d3a55;font-family:inherit;';
      const tt=document.createElement('div'); tt.style.cssText='font-size:16px;font-weight:700;margin-bottom:6px;color:#e8edf8;'; tt.textContent='Two quick questions before I build:'; cd.appendChild(tt);
      const sub=document.createElement('div'); sub.style.cssText='font-size:12px;color:#8899bb;margin-bottom:20px;'; sub.textContent='One reply covers both -- or just describe what you need.'; cd.appendChild(sub);
      const lbl1=document.createElement('div'); lbl1.style.cssText='font-size:13px;font-weight:600;color:#c8d8f0;margin-bottom:6px;'; lbl1.textContent='1. What is it for?'; cd.appendChild(lbl1);
      const inp1=document.createElement('input'); inp1.type='text'; inp1.placeholder='e.g. portfolio, e-commerce store, business landing page...'; inp1.style.cssText='width:100%;box-sizing:border-box;padding:9px 12px;background:#0f1629;border:1px solid #2d3a55;border-radius:8px;color:#e8edf8;font-size:13px;margin-bottom:16px;outline:none;'; cd.appendChild(inp1); setTimeout(()=>inp1.focus(),30);
      const lbl2=document.createElement('div'); lbl2.style.cssText='font-size:13px;font-weight:600;color:#c8d8f0;margin-bottom:6px;'; lbl2.textContent='2. How big / complex?'; cd.appendChild(lbl2);
      const sel=document.createElement('select'); sel.style.cssText='width:100%;box-sizing:border-box;padding:9px 12px;background:#0f1629;border:1px solid #2d3a55;border-radius:8px;color:#e8edf8;font-size:13px;margin-bottom:24px;outline:none;';
      [['simple','Simple -- 1-2 pages, mostly HTML/CSS'],['medium','Medium -- multi-section with JavaScript, forms, animations'],['full','Full -- backend, database, auth, or APIs']].forEach(([v,l])=>{ const o=document.createElement('option'); o.value=v; o.textContent=l; sel.appendChild(o); });
      cd.appendChild(sel);
      const btns=document.createElement('div'); btns.style.cssText='display:flex;justify-content:flex-end;gap:12px;';
      const skip=document.createElement('button'); skip.textContent='Skip'; skip.style.cssText='padding:8px 18px;border:1px solid #2d3a55;border-radius:8px;background:transparent;color:#8899bb;cursor:pointer;font-size:13px;';
      skip.addEventListener('click',()=>{ ov.remove(); vscode.postMessage({type:'scope-cancel'}); }); btns.appendChild(skip);
      const go=document.createElement('button'); go.textContent='Start Building'; go.style.cssText='padding:8px 20px;border:none;border-radius:8px;background:linear-gradient(135deg,#2563eb,#4d9eff);color:#fff;cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 2px 10px rgba(77,158,255,0.3);';
      go.addEventListener('click',()=>{ const ans=inp1.value.trim()+' ('+sel.value+')'; ov.remove(); vscode.postMessage({type:'scope-submit',answer:ans}); }); btns.appendChild(go);
      inp1.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); go.click(); } });
      cd.appendChild(btns); ov.appendChild(cd); document.body.appendChild(ov);
    }

    function showVaultHitPanel(resolverId, task, matchCount, isSemantic) {
      const existing = document.getElementById('gate-modal-overlay'); if(existing) existing.remove();
      const ov=document.createElement('div'); ov.id='gate-modal-overlay'; ov.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
      const cd=document.createElement('div'); cd.style.cssText='background:#1e2740;color:#e8edf8;border-radius:12px;padding:28px 32px;width:440px;max-width:90vw;box-shadow:0 12px 48px rgba(0,0,0,0.6);border:1px solid #2d3a55;font-family:inherit;';
      
      const tt=document.createElement('div'); tt.style.cssText='font-size:17px;font-weight:700;margin-bottom:12px;color:#e8edf8;display:flex;align-items:center;gap:8px;'; 
      tt.innerHTML = '<span style="font-size:20px">\uD83D\uDD12</span> Vault Matches Found'; 
      cd.appendChild(tt);
      
      const sub=document.createElement('div'); sub.style.cssText='font-size:13px;color:#8899bb;margin-bottom:24px;line-height:1.5;'; 
      sub.innerHTML = 'CHASSIS found <strong>' + matchCount + '</strong> components in your Vault that match this request. Using vault components guarantees stability and uses fewer tokens.';
      cd.appendChild(sub);
      
      const btns=document.createElement('div'); btns.style.cssText='display:flex;justify-content:flex-end;gap:12px;';
      
      const cn=document.createElement('button'); cn.textContent='Cancel'; cn.style.cssText='padding:8px 18px;border:1px solid #2d3a55;border-radius:8px;background:transparent;color:#8899bb;cursor:pointer;font-size:13px;'; 
      cn.addEventListener('click',() => { ov.remove(); vscode.postMessage({ type: 'vault-hit-' + resolverId, choice: 'cancel' }); }); 
      btns.appendChild(cn);

      const fr=document.createElement('button'); fr.textContent='Build Fresh'; fr.style.cssText='padding:8px 18px;border:1px solid #4d9eff;border-radius:8px;background:transparent;color:#4d9eff;cursor:pointer;font-size:13px;font-weight:600;'; 
      fr.addEventListener('click',() => { ov.remove(); vscode.postMessage({ type: 'vault-hit-' + resolverId, choice: 'build-fresh' }); }); 
      btns.appendChild(fr);

      const np=document.createElement('button'); np.textContent='Use Vault Code'; np.style.cssText='padding:8px 20px;border:none;border-radius:8px;background:linear-gradient(135deg,#4ec959,#2ea043);color:#fff;cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 2px 10px rgba(46,160,67,0.3);'; 
      np.addEventListener('click',() => { ov.remove(); vscode.postMessage({ type: 'vault-hit-' + resolverId, choice: 'use-vault' }); }); 
      btns.appendChild(np);
      
      cd.appendChild(btns); ov.appendChild(cd); document.body.appendChild(ov);
    }
  `;
}
