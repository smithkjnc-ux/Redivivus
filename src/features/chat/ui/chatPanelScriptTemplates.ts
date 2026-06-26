// [SCOPE] Chat Panel Webview Script — Template Library Wizard
// Extracted from chatPanelScript.ts. Keep under 200 lines.

export function buildTemplatesScript(): string {
  return `
    function showTemplateWizard(msg) {
      const cats = msg.categories || [];
      const existing = document.getElementById('tmpl-wiz-overlay'); if (existing) existing.remove();
      const ov = document.createElement('div'); ov.id = 'tmpl-wiz-overlay'; ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;';
      const cd = document.createElement('div'); cd.style.cssText = 'background:#1e2740;color:#e8edf8;border-radius:14px;width:500px;max-width:94vw;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,0.6);border:1px solid #2d3a55;overflow:hidden;font-family:inherit;';
      const wizHdr = document.createElement('div'); wizHdr.style.cssText = 'padding:18px 22px 14px;border-bottom:1px solid #2d3a55;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;';
      const wizTitle = document.createElement('div'); wizTitle.style.cssText = 'font-size:15px;font-weight:700;color:#e8edf8;'; wizTitle.textContent = 'Redivivus Template Library';
      const wizSub = document.createElement('div'); wizSub.id = 'tmpl-wiz-sub'; wizSub.style.cssText = 'font-size:12px;color:#8899bb;margin-top:3px;'; wizSub.textContent = 'Step 1 of 3 \u2014 Choose a project type';
      const wizTitleWrap = document.createElement('div'); wizTitleWrap.appendChild(wizTitle); wizTitleWrap.appendChild(wizSub);
      const wizClose = document.createElement('button'); wizClose.textContent = '\\u00D7'; wizClose.style.cssText = 'background:none;border:none;color:#8899bb;font-size:22px;cursor:pointer;padding:0 4px;line-height:1;flex-shrink:0;';
      wizClose.onclick = () => { ov.remove(); vscode.postMessage({ type: 'template-wizard-cancel' }); };
      wizHdr.appendChild(wizTitleWrap); wizHdr.appendChild(wizClose); cd.appendChild(wizHdr);
      const wizBody = document.createElement('div'); wizBody.id = 'tmpl-wiz-body'; wizBody.style.cssText = 'flex:1;overflow-y:auto;padding:16px 18px;'; cd.appendChild(wizBody);
      const wizFoot = document.createElement('div'); wizFoot.style.cssText = 'padding:12px 18px;border-top:1px solid #2d3a55;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;gap:10px;';
      const wizBack = document.createElement('button'); wizBack.textContent = '\\u2190 Back'; wizBack.style.cssText = 'padding:8px 16px;border:1px solid #2d3a55;background:transparent;color:#8899bb;border-radius:8px;cursor:pointer;font-size:13px;font-family:inherit;display:none;';
      const wizCancel = document.createElement('button'); wizCancel.textContent = 'Cancel'; wizCancel.style.cssText = 'padding:8px 16px;border:1px solid #2d3a55;background:transparent;color:#8899bb;border-radius:8px;cursor:pointer;font-size:13px;font-family:inherit;';
      wizCancel.onclick = () => { ov.remove(); vscode.postMessage({ type: 'template-wizard-cancel' }); };
      const wizNext = document.createElement('button'); wizNext.textContent = 'Next \\u2192'; wizNext.style.cssText = 'padding:8px 20px;border:none;background:linear-gradient(135deg,#2563eb,#4d9eff);color:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit;box-shadow:0 2px 10px rgba(77,158,255,0.4);';
      const wizBtnsRight = document.createElement('div'); wizBtnsRight.style.cssText='display:flex;gap:8px;'; wizBtnsRight.appendChild(wizCancel); wizBtnsRight.appendChild(wizNext);
      wizFoot.appendChild(wizBack); wizFoot.appendChild(wizBtnsRight); cd.appendChild(wizFoot);
      ov.appendChild(cd); document.body.appendChild(ov);
      let wizStep = 1; let selCat = null; let selSub = null;
      function wizCard(label, desc, icon) {
        const card = document.createElement('div'); card.style.cssText = 'display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border-radius:10px;border:1px solid #2d3a55;cursor:pointer;transition:all 0.15s;margin-bottom:8px;background:#1a2035;';
        const ico = document.createElement('div'); ico.style.cssText='font-size:22px;flex-shrink:0;margin-top:1px;'; ico.textContent=icon;
        const info = document.createElement('div'); const lbl = document.createElement('div'); lbl.style.cssText='font-size:13px;font-weight:600;color:#e8edf8;'; lbl.textContent=label;
        const dsc = document.createElement('div'); dsc.style.cssText='font-size:11px;color:#8899bb;margin-top:3px;line-height:1.4;'; dsc.textContent=desc;
        info.appendChild(lbl); info.appendChild(dsc); card.appendChild(ico); card.appendChild(info); return card;
      }
      function renderStep1() {
        wizSub.textContent = 'Step 1 of 3 \u2014 Choose a project type'; wizBack.style.display = 'none'; wizNext.textContent = 'Next \\u2192'; wizBody.innerHTML = '';
        cats.forEach(cat => {
          const _icon = {'[WEB]':'[Web]','[GAME]':'[Game]','[APP]':'[App]','[API]':'[API]'}[cat.icon] || cat.icon;
          const card = wizCard(cat.label, cat.description, _icon);
          card.onclick = () => { wizBody.querySelectorAll('[data-selected]').forEach(c => { c.removeAttribute('data-selected'); c.style.background='#1a2035'; c.style.borderColor='#2d3a55'; }); card.dataset.selected = '1'; card.style.background='rgba(77,158,255,0.15)'; card.style.borderColor='#4d9eff'; selCat = cat; };
          wizBody.appendChild(card); if (msg.preselect && msg.preselect.catId === cat.id) setTimeout(() => card.click(), 10);
        });
      }
      function renderStep2() {
        wizSub.textContent = 'Step 2 of 3 \u2014 Choose a template'; wizBack.style.display = 'inline-block'; wizBody.innerHTML = '';
        (selCat.subcategories || []).forEach(sub => {
          const card = wizCard(sub.label, sub.description, '\\u25B6');
          card.onclick = () => { wizBody.querySelectorAll('[data-selected]').forEach(c => { c.removeAttribute('data-selected'); c.style.background='#1a2035'; c.style.borderColor='#2d3a55'; }); card.dataset.selected = '1'; card.style.background='rgba(77,158,255,0.15)'; card.style.borderColor='#4d9eff'; selSub = sub; };
          wizBody.appendChild(card); if (msg.preselect && msg.preselect.subId === sub.id) setTimeout(() => card.click(), 10);
        });
      }
      function renderStep3() {
        wizSub.textContent = 'Step 3 of 3 \u2014 Customize your ' + selSub.label; wizBack.style.display = 'inline-block'; wizNext.textContent = 'Build It'; wizBody.innerHTML = '';
        (selSub.wizardQuestions || []).forEach(q => {
          const wrap = document.createElement('div'); wrap.style.cssText='margin-bottom:14px;';
          const lbl = document.createElement('label'); lbl.style.cssText='display:block;font-size:12px;font-weight:600;color:#e8edf8;margin-bottom:5px;'; lbl.textContent = q.prompt + (q.required ? '' : ' (optional)');
          const inp = document.createElement('input'); inp.type='text'; inp.id='wq-'+q.id; inp.placeholder=q.placeholder; inp.style.cssText='width:100%;padding:9px 12px;background:#1a2035;border:1px solid #2d3a55;border-radius:8px;color:#e8edf8;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;';
          wrap.appendChild(lbl); wrap.appendChild(inp); wizBody.appendChild(wrap);
        });
      }
      wizNext.onclick = () => {
        if (wizStep === 1 && selCat) { wizStep = 2; renderStep2(); }
        else if (wizStep === 2 && selSub) { wizStep = 3; renderStep3(); }
        else if (wizStep === 3) {
          const answers = {}; (selSub.wizardQuestions || []).forEach(q => { const v=document.getElementById('wq-'+q.id).value.trim(); if(v) answers[q.id]=v; });
          ov.remove(); vscode.postMessage({ type: 'template-wizard-submit', catId: selCat.id, subId: selSub.id, registryPath: selSub.registryPath, label: selSub.label, answers });
        }
      };
      wizBack.onclick = () => { if (wizStep === 3) { wizStep = 2; renderStep2(); } else if (wizStep === 2) { wizStep = 1; renderStep1(); } };
      renderStep1();
    }
  `;
}
