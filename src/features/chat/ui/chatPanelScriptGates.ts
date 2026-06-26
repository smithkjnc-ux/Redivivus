// [SCOPE] Chat Panel Webview Script — Modals for Build Gates (Placement, Cost, Vault) + Agent Mode Info Panel
// Extracted to keep chatPanelScript under 200 lines.
// [DONE] Added showAgentInfoPanel() with Simple/Agent branding, cost table, tool list, enable/disable toggle.

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
      if (noProject) { sub.innerHTML = 'You are trying to build a project, but <strong>no workspace folder is open</strong>. Do you want to create a new project folder?'; }
      else { sub.innerHTML = 'You are asking to build a project, but you already have <strong>' + projectName + '</strong> open. Where should this be built?'; }
      cd.appendChild(sub);
      const btns=document.createElement('div'); btns.style.cssText='display:flex;justify-content:flex-end;gap:12px;';
      const cn=document.createElement('button'); cn.textContent='Cancel Build'; cn.style.cssText='padding:8px 18px;border:1px solid #2d3a55;border-radius:8px;background:transparent;color:#8899bb;cursor:pointer;font-size:13px;';
      cn.addEventListener('click',()=>{ ov.remove(); vscode.postMessage({ type: 'placement-' + placementId, choice: 'cancel' }); }); btns.appendChild(cn);
      if (!noProject) { const here=document.createElement('button'); here.textContent='Build Here'; here.style.cssText='padding:8px 18px;border:1px solid #4d9eff;border-radius:8px;background:transparent;color:#4d9eff;cursor:pointer;font-size:13px;font-weight:600;'; here.addEventListener('click',()=>{ ov.remove(); vscode.postMessage({ type: 'placement-' + placementId, choice: 'here' }); }); btns.appendChild(here); }
      const np=document.createElement('button'); np.textContent='Create New Project'; np.style.cssText='padding:8px 20px;border:none;border-radius:8px;background:linear-gradient(135deg,#2563eb,#4d9eff);color:#fff;cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 2px 10px rgba(77,158,255,0.3);';
      np.addEventListener('click',()=>{ ov.remove(); vscode.postMessage({ type: 'placement-' + placementId, choice: 'new-project' }); }); btns.appendChild(np);
      cd.appendChild(btns); ov.appendChild(cd); document.body.appendChild(ov);
    }

    function showCostEstimatePanel(buildId, estimate) {
      const existing = document.getElementById('gate-modal-overlay'); if(existing) existing.remove();
      const ov=document.createElement('div'); ov.id='gate-modal-overlay'; ov.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;';
      const cd=document.createElement('div'); cd.style.cssText='background:#1a2035;color:#e8edf8;border-radius:12px;padding:24px 28px;width:420px;max-width:92vw;box-shadow:0 12px 48px rgba(0,0,0,0.7);border:1px solid #2d3a55;font-family:inherit;';
      const hdr=document.createElement('div'); hdr.style.cssText='font-size:11px;font-weight:700;letter-spacing:1.5px;color:#4d9eff;text-transform:uppercase;margin-bottom:6px;'; hdr.textContent='Redivivus BUILD ESTIMATE'; cd.appendChild(hdr);
      const divider=document.createElement('div'); divider.style.cssText='border-top:1px solid #2d3a55;margin-bottom:16px;'; cd.appendChild(divider);


      if (estimate.description) { const dsc=document.createElement('div'); dsc.style.cssText='font-size:13px;color:#c8d8f0;margin-bottom:16px;line-height:1.5;'; dsc.innerHTML = 'Planning to create: <strong>' + estimate.description + '</strong> (~' + (estimate.fileCount||3) + ' files)'; cd.appendChild(dsc); }
      function formatUSD(v){if(!v||v===0)return'Free';if(v<0.0001)return'~$0.0001';return'~$'+(Math.ceil(v*10000)/10000).toFixed(4);}
      const stats=document.createElement('div'); stats.style.cssText='background:#0f1629;border:1px solid #2d3a55;border-radius:8px;padding:14px 16px;margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px;';
      const cell=(label,val,highlight)=>'<div style="display:flex;flex-direction:column;gap:2px;"><span style="font-size:10px;color:#8899bb;text-transform:uppercase;letter-spacing:0.5px;display:block;">'+label+'</span><span style="font-size:'+(highlight?'20':'14')+'px;font-weight:700;color:'+(highlight?'#4ec959':'#e8edf8')+';">'+val+'</span></div>';
      const totalTok=(estimate.tokens+(estimate.supervisorTokens||0)+(estimate.guardianTokens||0));
      stats.innerHTML=cell('Total Cost',estimate.totalCostFormatted,true)+cell('AI Worker',estimate.modelLabel,false)+cell('Build Phases',estimate.phases+' steps',false)+cell('Total Tokens','~'+(totalTok/1000).toFixed(1)+'k',false);
      cd.appendChild(stats);
      if (estimate.supervisorLabel || estimate.guardianLabel) {
        const brk=document.createElement('div'); brk.style.cssText='background:#0a1020;border:1px solid #1e2a40;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#8899bb;';
        let rows='<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:#4d9eff;margin-bottom:8px;">AI Cost Breakdown</div>';
        rows+='<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>&#x2699; Worker: '+estimate.modelLabel+'</span><span>~'+(estimate.tokens/1000).toFixed(1)+'k tok &bull; '+estimate.costFormatted+'</span></div>';
        if (estimate.supervisorLabel&&estimate.supervisorTokens!=null){rows+='<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>&#x1F3AF; Supervisor: '+estimate.supervisorLabel+'</span><span>~'+(estimate.supervisorTokens/1000).toFixed(1)+'k tok &bull; '+formatUSD(estimate.supervisorCostUSD)+'</span></div>';}
        if (estimate.guardianLabel&&estimate.guardianTokens!=null){rows+='<div style="display:flex;justify-content:space-between;"><span>&#x1F6E1; Guardian: '+estimate.guardianLabel+'</span><span>~'+(estimate.guardianTokens/1000).toFixed(1)+'k tok &bull; '+formatUSD(estimate.guardianCostUSD)+'</span></div>';}
        brk.innerHTML=rows; cd.appendChild(brk);
      }
      const btns=document.createElement('div'); btns.style.cssText='display:flex;justify-content:flex-end;gap:10px;';
      const cn=document.createElement('button'); cn.textContent='Not Yet'; cn.style.cssText='padding:8px 18px;border:1px solid #2d3a55;border-radius:8px;background:transparent;color:#8899bb;cursor:pointer;font-size:13px;';
      cn.addEventListener('click',()=>{ ov.remove(); vscode.postMessage({ type: 'confirm-build', buildId, confirmed: false }); }); btns.appendChild(cn);
      const go=document.createElement('button'); go.textContent="Let\\u2019s Build It!"; go.style.cssText='padding:8px 22px;border:none;border-radius:8px;background:linear-gradient(135deg,#2563eb,#4d9eff);color:#fff;cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 2px 10px rgba(77,158,255,0.3);';
      go.addEventListener('click',()=>{ ov.remove(); vscode.postMessage({ type: 'confirm-build', buildId, confirmed: true }); }); btns.appendChild(go);
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
      tt.innerHTML = '<span style="font-size:20px">\\uD83D\\uDD12</span> Vault Matches Found'; cd.appendChild(tt);
      const sub=document.createElement('div'); sub.style.cssText='font-size:13px;color:#8899bb;margin-bottom:24px;line-height:1.5;';
      sub.innerHTML = 'Redivivus found <strong>' + matchCount + '</strong> components in your Vault that match this request. Using vault components guarantees stability and uses fewer tokens.'; cd.appendChild(sub);
      const btns=document.createElement('div'); btns.style.cssText='display:flex;justify-content:flex-end;gap:12px;';
      const cn=document.createElement('button'); cn.textContent='Cancel'; cn.style.cssText='padding:8px 18px;border:1px solid #2d3a55;border-radius:8px;background:transparent;color:#8899bb;cursor:pointer;font-size:13px;'; cn.addEventListener('click',()=>{ ov.remove(); vscode.postMessage({ type: 'vault-hit-' + resolverId, choice: 'cancel' }); }); btns.appendChild(cn);
      const fr=document.createElement('button'); fr.textContent='Build Fresh'; fr.style.cssText='padding:8px 18px;border:1px solid #4d9eff;border-radius:8px;background:transparent;color:#4d9eff;cursor:pointer;font-size:13px;font-weight:600;'; fr.addEventListener('click',()=>{ ov.remove(); vscode.postMessage({ type: 'vault-hit-' + resolverId, choice: 'build-fresh' }); }); btns.appendChild(fr);
      const np=document.createElement('button'); np.textContent='Use Vault Code'; np.style.cssText='padding:8px 20px;border:none;border-radius:8px;background:linear-gradient(135deg,#4ec959,#2ea043);color:#fff;cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 2px 10px rgba(46,160,67,0.3);'; np.addEventListener('click',()=>{ ov.remove(); vscode.postMessage({ type: 'vault-hit-' + resolverId, choice: 'use-vault' }); }); btns.appendChild(np);
      cd.appendChild(btns); ov.appendChild(cd); document.body.appendChild(ov);
    }

    // [Redivivus] Adaptive Mode Info Panel
    function showAgentInfoPanel() {
      const existing = document.getElementById('gate-modal-overlay'); if(existing) existing.remove();
      const ov=document.createElement('div'); ov.id='gate-modal-overlay'; ov.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:9999;';
      const cd=document.createElement('div'); cd.style.cssText='background:#0f1629;color:#e8edf8;border-radius:14px;padding:26px 30px;width:400px;max-width:94vw;max-height:88vh;overflow-y:auto;box-shadow:0 20px 70px rgba(0,0,0,0.85);border:2px solid #22d3ee;font-family:inherit;';

      const hdr=document.createElement('div'); hdr.style.cssText='display:flex;align-items:center;gap:12px;margin-bottom:20px;';
      const icon=document.createElement('div'); icon.style.cssText='font-size:28px;line-height:1;'; icon.textContent='\\uD83D\\uDD00';
      const titles=document.createElement('div');
      titles.innerHTML='<div style="font-size:17px;font-weight:800;letter-spacing:0.5px;color:#e8edf8;">Adaptive Pipeline</div>'+
        '<div style="font-size:11px;color:#8899bb;margin-top:3px;font-family:monospace;">Supervisor auto-routes each prompt to optimal pipeline.</div>';
      hdr.appendChild(icon); hdr.appendChild(titles); cd.appendChild(hdr);

      const dsc=document.createElement('div'); dsc.style.cssText='font-size:13px;color:#c8d8f0;margin-bottom:24px;line-height:1.6;';
      dsc.innerHTML = 'Redivivus runs silently in Adaptive Mode. Simple tasks are routed to a fast, surgical pipeline. Complex tasks are routed to an autonomous agent loop that can read files and run terminal commands.';
      cd.appendChild(dsc);

      const btns=document.createElement('div'); btns.style.cssText='display:flex;justify-content:flex-end;gap:8px;';
      const close=document.createElement('button'); close.textContent='Close'; close.style.cssText='padding:8px 18px;border:1px solid #2d3a55;border-radius:8px;background:transparent;color:#8899bb;cursor:pointer;font-size:13px;';
      close.addEventListener('click',()=>ov.remove()); btns.appendChild(close);
      cd.appendChild(btns);
      ov.appendChild(cd); document.body.appendChild(ov);
    }
  `;
}
