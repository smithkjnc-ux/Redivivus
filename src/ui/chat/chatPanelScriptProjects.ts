// [SCOPE] Chat Panel Webview Script — Projects & Folder management
// Extracted from chatPanelScript.ts. Keep under 200 lines.

export function buildProjectsScript(): string {
  return `
    function showCreateFolderPanel(prefillName, pendingTask) {
      const existing = document.getElementById('cf-modal-overlay'); if (existing) existing.remove();
      const ov=document.createElement('div'); ov.id='cf-modal-overlay'; ov.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
      const cd=document.createElement('div'); cd.style.cssText='background:#ffffff;color:#1e1e1e;border-radius:8px;padding:28px 32px;width:520px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.35);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
      const tt=document.createElement('div'); tt.style.cssText='font-size:17px;font-weight:600;margin-bottom:6px;'; tt.textContent='Create New Project Folder'; cd.appendChild(tt);
      const sub=document.createElement('div'); sub.style.cssText='font-size:12px;color:#666;margin-bottom:20px;'; sub.textContent='A folder will be created and opened as your project workspace.'; cd.appendChild(sub);
      const nl=document.createElement('label'); nl.style.cssText='display:block;font-weight:600;font-size:13px;margin-bottom:6px;'; nl.textContent='Project name'; cd.appendChild(nl);
      const ni=document.createElement('input'); ni.type='text'; ni.value=prefillName; ni.style.cssText='width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:5px;font-size:14px;color:#1e1e1e;background:#fff;outline:none;margin-bottom:16px;'; cd.appendChild(ni);
      const ll=document.createElement('label'); ll.style.cssText='display:block;font-weight:600;font-size:13px;margin-bottom:6px;'; ll.textContent='Create inside'; cd.appendChild(ll);
      const lr=document.createElement('div'); lr.style.cssText='display:flex;gap:6px;align-items:center;margin-bottom:20px;';
      const pi=document.createElement('input'); pi.type='text'; pi.value='~/projects'; pi.style.cssText='flex:1;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:5px;font-size:12px;color:#1e1e1e;background:#fff;outline:none;font-family:monospace;'; lr.appendChild(pi);
      const bb=document.createElement('button'); bb.textContent='Browse'; bb.style.cssText='padding:9px 14px;border:1px solid #ccc;border-radius:5px;background:#fff;color:#1e1e1e;cursor:pointer;font-size:13px;white-space:nowrap;'; bb.addEventListener('click',()=>vscode.postMessage({type:'browse-folder',currentPath:pi.value})); lr.appendChild(bb); cd.appendChild(lr); cd.appendChild(lr);
      const btns=document.createElement('div'); btns.style.cssText='display:flex;justify-content:flex-end;gap:10px;';
      const cn=document.createElement('button'); cn.textContent='Cancel'; cn.style.cssText='padding:8px 18px;border:1px solid #ccc;border-radius:5px;background:#fff;color:#666;cursor:pointer;font-size:13px;'; cn.addEventListener('click',()=>ov.remove()); btns.appendChild(cn);
      const cr=document.createElement('button'); cr.textContent='Create & Open'; cr.style.cssText='padding:8px 20px;border:none;border-radius:5px;background:#0078d4;color:#fff;cursor:pointer;font-size:13px;font-weight:600;';
      cr.addEventListener('click',()=>{ const n=ni.value.trim(); const p=pi.value.trim(); if(!n){ni.focus();return;} ov.remove(); vscode.postMessage({type:'create-folder',name:n,parentPath:p,pendingTask}); });
      btns.appendChild(cr); cd.appendChild(btns); ov.appendChild(cd); document.body.appendChild(ov);
      setTimeout(()=>{ni.focus();ni.select();},30);
    }

    function showNewProjectPanel(suggestedParent, prefillTask, compact, vaultOnly, prefillAnswers) {
      const allQuestions = [
        { key: 'who',   label: 'WHO',   preamble: 'This shapes every decision about complexity and UI.',       prompt: 'Who is going to use this? Picture the person \u2014 their skill level and context.',  placeholder: 'e.g., Non-technical users who want to sell locally without an account' },
        { key: 'what',  label: 'WHAT',  preamble: 'Not the dream feature list \u2014 the minimum thing that works.', prompt: 'What does it need to do? One sentence that describes success.',                 placeholder: 'e.g., Let users post and find local listings anonymously' },
        { key: 'where', label: 'WHERE', preamble: 'This determines the entire tech stack.',                      prompt: 'Where does this live and run? Web? Mobile? Desktop? Local? Cloud?',            placeholder: 'e.g., React Native mobile app, Firebase backend, Android first' },
        { key: 'when',  label: 'WHEN',  preamble: 'Timeline and responsiveness requirements.',                   prompt: 'When does this need to work? Timeline and responsiveness.',                    placeholder: 'e.g., MVP in 2 months, real-time messaging, 24hr listing lifetime' },
        { key: 'why',   label: 'WHY',   preamble: 'The gut check. If the answer is weak, know it now.',          prompt: 'Why does this need to exist? What problem is not already solved?',            placeholder: 'e.g., No marketplace lets you sell locally without a tracked account' },
      ];
      var _prefill = {};
      if (prefillAnswers) {
        for (var _k2 in prefillAnswers) { if (prefillAnswers[_k2]) { _prefill[_k2] = prefillAnswers[_k2]; } }
      }
      if (prefillTask) {
        if (!_prefill['what']) { var _fs = prefillTask.split(/[.!?]\s+/)[0].trim(); _prefill['what'] = _fs.length > 0 && _fs.length <= 120 ? _fs : prefillTask.slice(0, 120); }
        if (!_prefill['who']) { _prefill['who'] = /myself|personal|just me|solo/i.test(prefillTask) ? 'myself \u2014 personal use' : 'myself'; }
        if (!_prefill['where']) { _prefill['where'] = /\bweb\b|browser|website|html/i.test(prefillTask) ? 'Web browser' : /desktop|pc|mac|laptop/i.test(prefillTask) ? 'Desktop app' : /mobile|phone|android|ios/i.test(prefillTask) ? 'Mobile app' : ''; }
        if (!_prefill['when']) { _prefill['when'] = 'now'; }
      }
      const questions = allQuestions.filter(function(q) { return !_prefill[q.key]; });
      const answers = {};
      for (var _k in _prefill) { if (_prefill[_k]) { answers[_k] = _prefill[_k]; } }
      let step = 0; let projectName = (prefillAnswers && prefillAnswers['suggestedName']) ? prefillAnswers['suggestedName'] : '';
      const existing = document.getElementById('np-modal-overlay');
      if (existing) existing.remove();

      if (compact && prefillTask) {
        const ov=document.createElement('div'); ov.id='np-modal-overlay'; ov.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
        const cd=document.createElement('div'); cd.style.cssText='background:#1e2740;color:#e8edf8;border-radius:12px;padding:28px 32px;width:520px;max-width:90vw;box-shadow:0 12px 48px rgba(0,0,0,0.6);border:1px solid #2d3a55;font-family:inherit;';
        const tt=document.createElement('div'); tt.style.cssText='font-size:17px;font-weight:700;margin-bottom:6px;color:#e8edf8;'; tt.textContent= vaultOnly ? 'Build & Save to Vault' : 'Confirm Build Task'; cd.appendChild(tt);
        const sub=document.createElement('div'); sub.style.cssText='font-size:12px;color:#8899bb;margin-bottom:16px;'; sub.textContent= vaultOnly ? 'This looks like a standalone function. CHASSIS will build it and save it directly to your Vault -- no project folder needed.' : 'Review and edit your request before building. Add any extra detail that will help.'; cd.appendChild(sub);
        const ta=document.createElement('textarea'); ta.rows=4; ta.value=prefillTask; ta.style.cssText='width:100%;box-sizing:border-box;padding:10px;border:1px solid #2d3a55;border-radius:8px;font-size:13px;resize:vertical;font-family:inherit;color:#e8edf8;background:#1a2035;outline:none;'; cd.appendChild(ta);
        setTimeout(()=>{ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);},30);
        const btns=document.createElement('div'); btns.style.cssText='display:flex;justify-content:flex-end;gap:10px;margin-top:18px;';
        const cn=document.createElement('button'); cn.textContent='Cancel'; cn.style.cssText='padding:8px 18px;border:1px solid #2d3a55;border-radius:8px;background:transparent;color:#8899bb;cursor:pointer;font-size:13px;'; cn.addEventListener('click',()=>{ov.remove();vscode.postMessage({type:'new-project-cancel'});}); btns.appendChild(cn);
        if (!vaultOnly) { const more=document.createElement('button'); more.textContent='Full Setup Wizard'; more.style.cssText='padding:8px 18px;border:1px solid #2d3a55;border-radius:8px;background:transparent;color:#e8edf8;cursor:pointer;font-size:13px;'; more.addEventListener('click',()=>{ov.remove();showNewProjectPanel(suggestedParent,ta.value.trim(),false,false,prefillAnswers);}); btns.appendChild(more); }
        // [FIX] Was posting {type:'show-panel', panelType:'create-folder'} to extension — no inbound handler exists.
        // showCreateFolderPanel is defined in this webview and posts {type:'create-folder'} which IS handled.
        if (vaultOnly) { const proj=document.createElement('button'); proj.textContent='Make it a Project Instead'; proj.style.cssText='padding:8px 18px;border:1px solid #2d3a55;border-radius:8px;background:transparent;color:#e8edf8;cursor:pointer;font-size:13px;'; proj.addEventListener('click',()=>{const t=ta.value.trim();ov.remove();showCreateFolderPanel(t.replace(/[^a-zA-Z0-9\\s]/g,'').trim().split(/\\s+/).slice(0,4).join('-').toLowerCase(),t);});  btns.appendChild(proj); }
        const bld=document.createElement('button'); bld.textContent= vaultOnly ? 'Build & Save to Vault' : 'Build it'; bld.style.cssText='padding:8px 20px;border:none;border-radius:8px;background:linear-gradient(135deg,#2563eb,#4d9eff);color:#fff;cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 2px 10px rgba(77,158,255,0.3);'; bld.addEventListener('click',()=>{const t=ta.value.trim();if(!t)return;ov.remove();vscode.postMessage({type:'build-task',task:t,vaultOnly:!!vaultOnly});}); btns.appendChild(bld);
        cd.appendChild(btns); ov.appendChild(cd); document.body.appendChild(ov);
        return;
      }

      const overlay = document.createElement('div'); overlay.id = 'np-modal-overlay'; overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
      const card = document.createElement('div'); card.id = 'np-modal-card'; card.style.cssText = 'background:#1e2740;color:#e8edf8;border-radius:12px;padding:28px 32px;width:520px;max-width:90vw;box-shadow:0 12px 48px rgba(0,0,0,0.6);border:1px solid #2d3a55;font-family:inherit;';
      overlay.appendChild(card); document.body.appendChild(overlay);
      function renderStep() {
        card.innerHTML = '';
        const title = document.createElement('div'); title.style.cssText = 'font-size:17px;font-weight:700;color:#e8edf8;margin-bottom:6px;'; title.textContent = 'CHASSIS \u2014 New Project Setup'; card.appendChild(title);
        const counter = document.createElement('div'); counter.style.cssText = 'font-size:12px;color:#8899bb;margin-bottom:18px;';
        counter.textContent = step < questions.length ? 'Question ' + (step+1) + ' of ' + (questions.length || 1) + (questions.length < 5 ? ' \u2014 ' + (5 - questions.length) + ' pre-filled by AI' : '') : 'Final step';
        card.appendChild(counter);
        const dots = document.createElement('div'); dots.style.cssText = 'display:flex;gap:6px;margin-bottom:20px;';
        questions.forEach((_,i) => { const d=document.createElement('div'); d.style.cssText='width:32px;height:5px;border-radius:3px;background:'+(i<=step?'#4d9eff':'#2d3a55')+';opacity:'+(i<step||i===step?'1':'0.4'); dots.appendChild(d); });
        card.appendChild(dots);
        if (step < questions.length) {
          const q = questions[step];
          const pre = document.createElement('div'); pre.style.cssText='font-size:12px;color:#8899bb;margin-bottom:10px;background:#1a2035;border-radius:6px;padding:8px 12px;border:1px solid #2d3a55;'; pre.textContent=q.preamble; card.appendChild(pre);
          const lbl = document.createElement('label'); lbl.style.cssText='display:block;font-weight:600;font-size:14px;color:#e8edf8;margin-bottom:10px;'; lbl.textContent=q.prompt; card.appendChild(lbl);
          const ta = document.createElement('textarea'); ta.id='np-input'; ta.rows=3; ta.placeholder=q.placeholder; ta.style.cssText='width:100%;box-sizing:border-box;padding:10px;border:1px solid #2d3a55;border-radius:8px;font-size:13px;resize:vertical;font-family:inherit;color:#e8edf8;background:#1a2035;outline:none;';
          var _val = answers[q.key] || _prefill[q.key] || '';
          if (_val) { ta.value = _val; } card.appendChild(ta); setTimeout(()=>ta.focus(),30);
          function doNext() { answers[q.key]=ta.value.trim(); step++; renderStep(); }
          ta.addEventListener('keydown', (ev)=>{ if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();doNext();} });
          const btns=document.createElement('div'); btns.style.cssText='display:flex;justify-content:flex-end;gap:10px;margin-top:18px;';
          if (step>0) { const bk=document.createElement('button'); bk.textContent='Back'; bk.style.cssText='padding:8px 18px;border:1px solid #2d3a55;border-radius:8px;background:transparent;color:#8899bb;cursor:pointer;font-size:13px;'; bk.addEventListener('click',()=>{answers[q.key]=ta.value.trim();step--;renderStep();}); btns.appendChild(bk); }
          const cn=document.createElement('button'); cn.textContent='Cancel'; cn.style.cssText='padding:8px 18px;border:1px solid #2d3a55;border-radius:8px;background:transparent;color:#8899bb;cursor:pointer;font-size:13px;'; cn.addEventListener('click',()=>{overlay.remove();vscode.postMessage({type:'new-project-cancel'});}); btns.appendChild(cn);
          const nx=document.createElement('button'); nx.textContent=step<questions.length-1?'Next':'Continue'; nx.style.cssText='padding:8px 20px;border:none;border-radius:8px;background:linear-gradient(135deg,#2563eb,#4d9eff);color:#fff;cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 2px 10px rgba(77,158,255,0.3);'; nx.addEventListener('click',doNext); btns.appendChild(nx); card.appendChild(btns);
        } else {
          const nl=document.createElement('label'); nl.style.cssText='display:block;font-weight:600;font-size:14px;color:#e8edf8;margin-bottom:8px;'; nl.textContent='Project name'; card.appendChild(nl);
          const ni=document.createElement('input'); ni.id='np-name'; ni.type='text'; ni.placeholder='e.g., Do AI Dream, Ryppel, TorqGrid'; ni.style.cssText='width:100%;box-sizing:border-box;padding:10px;border:1px solid #2d3a55;border-radius:8px;font-size:14px;color:#e8edf8;background:#1a2035;outline:none;margin-bottom:4px;'; if(projectName)ni.value=projectName; card.appendChild(ni); setTimeout(()=>{ni.focus();ni.select();},30);
          const ll=document.createElement('label'); ll.style.cssText='display:block;font-weight:600;font-size:14px;color:#e8edf8;margin-bottom:6px;'; ll.textContent='Save location'; card.appendChild(ll);
          const lr=document.createElement('div'); lr.style.cssText='display:flex;gap:6px;align-items:center;';
          const pi=document.createElement('input'); pi.id='np-folder-path'; pi.type='text'; pi.style.cssText='flex:1;box-sizing:border-box;padding:10px;border:1px solid #2d3a55;border-radius:8px;font-size:12px;color:#e8edf8;background:#1a2035;outline:none;font-family:monospace;';
          function getSlug(){ return (ni.value.trim()||'my-project').replace(/[^a-zA-Z0-9_-]/g,'-').toLowerCase(); }
          pi.value=suggestedParent?suggestedParent+'/'+getSlug():'';
          let pathManual=false; pi.addEventListener('input',()=>{pathManual=true;}); ni.addEventListener('input',()=>{ if(!pathManual&&suggestedParent)pi.value=suggestedParent+'/'+getSlug(); });
          lr.appendChild(pi);
          const bb=document.createElement('button'); bb.textContent='Browse'; bb.style.cssText='padding:9px 14px;border:1px solid #2d3a55;border-radius:8px;background:#1a2035;color:#e8edf8;cursor:pointer;font-size:13px;white-space:nowrap;'; bb.addEventListener('click',()=>vscode.postMessage({type:'browse-folder',currentPath:pi.value})); lr.appendChild(bb); card.appendChild(lr);
          const btns=document.createElement('div'); btns.style.cssText='display:flex;justify-content:flex-end;gap:10px;margin-top:18px;';
          const bk=document.createElement('button'); bk.textContent='Back'; bk.style.cssText='padding:8px 18px;border:1px solid #2d3a55;border-radius:8px;background:transparent;color:#8899bb;cursor:pointer;font-size:13px;'; bk.addEventListener('click',()=>{projectName=ni.value.trim();step--;renderStep();}); btns.appendChild(bk);
          const cn=document.createElement('button'); cn.textContent='Cancel'; cn.style.cssText='padding:8px 18px;border:1px solid #2d3a55;border-radius:8px;background:transparent;color:#8899bb;cursor:pointer;font-size:13px;'; cn.addEventListener('click',()=>{overlay.remove();vscode.postMessage({type:'new-project-cancel'});}); btns.appendChild(cn);
          const cr=document.createElement('button'); cr.textContent='Create Project'; cr.style.cssText='padding:8px 20px;border:none;border-radius:8px;background:linear-gradient(135deg,#2563eb,#4d9eff);color:#fff;cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 2px 10px rgba(77,158,255,0.3);'; cr.addEventListener('click',()=>{ projectName=ni.value.trim(); if(!projectName){ni.focus();return;} vscode.postMessage({type:'new-project',answers,name:projectName,folderPath:pi.value.trim()||(suggestedParent+'/'+getSlug()),originalTask:prefillTask||''}); overlay.remove(); }); btns.appendChild(cr); card.appendChild(btns);
        }
      }
      renderStep();
    }

    function showProjectsModal(projects) {
      const existing = document.getElementById('projects-modal-overlay'); if (existing) existing.remove();
      const ov = document.createElement('div'); ov.id='projects-modal-overlay'; ov.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;';
      const cd = document.createElement('div'); cd.style.cssText='background:var(--vscode-editor-background);color:var(--vscode-foreground);border-radius:8px;width:560px;max-width:90vw;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.45);border:1px solid var(--vscode-editorGroup-border);overflow:hidden;';
      const hdr = document.createElement('div'); hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--vscode-editorGroup-border);flex-shrink:0;';
      const title = document.createElement('div'); title.style.cssText='font-size:15px;font-weight:700;'; title.textContent='\\uD83D\\uDCC1 CHASSIS Projects'; hdr.appendChild(title);
      const closeBtn = document.createElement('button'); closeBtn.textContent='\\u00D7'; closeBtn.style.cssText='background:none;border:none;color:var(--vscode-descriptionForeground);cursor:pointer;font-size:20px;padding:0 4px;line-height:1;'; closeBtn.onclick=()=>ov.remove(); hdr.appendChild(closeBtn); cd.appendChild(hdr);
      const list = document.createElement('div'); list.style.cssText='overflow-y:auto;padding:8px 0;flex:1;';
      if (projects.length === 0) {
        const empty = document.createElement('div'); empty.style.cssText='padding:24px 20px;text-align:center;color:var(--vscode-descriptionForeground);font-size:13px;'; empty.textContent='No CHASSIS projects found.'; list.appendChild(empty);
      } else {
        projects.forEach((p) => {
          const row = document.createElement('div'); row.style.cssText='display:flex;align-items:center;padding:10px 20px;cursor:pointer;gap:12px;transition:background 0.1s;'; row.onmouseenter=()=>{row.style.background='var(--vscode-list-hoverBackground)';}; row.onmouseleave=()=>{row.style.background='';};
          const name = document.createElement('div'); name.style.cssText='font-size:13px;font-weight:600;'; name.textContent=p.name;
          const fp = document.createElement('div'); fp.style.cssText='font-size:11px;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'; fp.textContent=p.fullPath;
          const info = document.createElement('div'); info.appendChild(name); info.appendChild(fp); row.appendChild(info);
          row.onclick=()=>{ov.remove();vscode.postMessage({type:'open-project',folderPath:p.fullPath});};
          list.appendChild(row);
        });
      }
      cd.appendChild(list); ov.appendChild(cd); document.body.appendChild(ov);
    }
  `;
}
