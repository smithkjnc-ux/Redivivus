// [SCOPE] Clarify wizard JS helpers — extracted from chatPanelScriptActionsB.ts (Rule 9 split).
// Covers: _buildQHtml, _showClarifySummary.

export function buildClarifyHelpersScript(): string {
  return `
    function _cEsc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function _buildQHtml(q, idx, total) {
      var nb = '<span style="display:flex;align-items:center;justify-content:center;min-width:26px;height:26px;border-radius:50%;background:rgba(59,130,246,0.15);color:#3b82f6;font-size:12px;font-weight:700;flex-shrink:0;">'+(idx+1)+'</span>';
      var title = '<div style="font-size:13px;font-weight:700;color:var(--vscode-foreground);margin-bottom:14px;display:flex;align-items:flex-start;gap:12px;line-height:1.5;">'+nb+'<span style="padding-top:3px;">'+_cEsc(q.question)+'</span></div>';
      if (q.freeText) {
        return '<div class="clarify-q-inner">'+title+'<div style="margin-left:38px;"><textarea class="clarify-freetext" data-qid="'+_cEsc(q.id)+'" placeholder="Optional — share any other preferences..." rows="3" style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 12px;color:var(--vscode-foreground);font-family:inherit;font-size:12.5px;resize:vertical;outline:none;box-sizing:border-box;"></textarea></div></div>';
      }
      var opts = (q.options||[]).map(function(opt,oIdx) {
        return '<label class="clarify-option" style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-radius:8px;cursor:pointer;font-size:12.5px;color:var(--vscode-foreground);border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);margin-bottom:8px;">'
          +'<input type="radio" name="clarify-'+_cEsc(q.id)+'" class="clarify-radio" data-qid="'+_cEsc(q.id)+'" value="'+_cEsc(opt.label)+'" '+(oIdx===0?'checked':'')+' style="margin:2px 0 0 0;accent-color:#3b82f6;width:15px;height:15px;flex-shrink:0;">'
          +'<span style="line-height:1.45;">'+_cEsc(opt.label)+'</span></label>';
      }).join('');
      var elab = '<div style="margin-top:10px;"><textarea class="clarify-elaborate" data-qid="'+_cEsc(q.id)+'" placeholder="Want to add more detail? (optional)" rows="2" style="width:100%;background:rgba(255,255,255,0.03);border:1px dashed rgba(255,255,255,0.08);border-radius:8px;padding:8px 12px;font-family:inherit;font-size:12px;resize:vertical;outline:none;box-sizing:border-box;color:var(--vscode-descriptionForeground);"></textarea></div>';
      return '<div class="clarify-q-inner">'+title+'<div style="margin-left:38px;display:flex;flex-direction:column;">'+opts+'</div><div style="margin-left:38px;">'+elab+'</div></div>';
    }

    function _showClarifySummary(card, questions) {
      var ans = card._clarifyAnswers || {};
      var items = '';
      for (var i=0; i<questions.length; i++) {
        var q = questions[i]; if (q.id === 'build_approach') continue;
        var a = ans[q.id]; if (!a) continue;
        var det = ans[q.id+'_detail'];
        items += '<div style="padding:10px 14px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);margin-bottom:8px;">'
          +'<div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:4px;">'+_cEsc(q.question)+'</div>'
          +'<div style="font-size:13px;font-weight:600;color:var(--vscode-foreground);">'+_cEsc(a)+'</div>'
          +(det ? '<div style="font-size:11px;color:#3b82f6;margin-top:4px;">→ '+_cEsc(det)+'</div>' : '')+'</div>';
      }
      var sumEl = card.querySelector('.clarify-summary');
      var qWrap = card.querySelector('.clarify-q-wrap');
      var nav = card.querySelector('.clarify-nav');
      if (qWrap) qWrap.style.display = 'none';
      if (nav) nav.style.display = 'none';
      if (sumEl) {
        sumEl.style.display = 'block';
        sumEl.innerHTML = '<div style="font-size:14px;font-weight:700;color:var(--vscode-foreground);margin-bottom:14px;">&#x1F4CB; Your build plan:</div>'
          +'<div>'+(items||'<em style="color:var(--vscode-descriptionForeground)">No specific preferences — AI decides everything.</em>')+'</div>'
          +'<div style="font-size:11px;color:var(--vscode-descriptionForeground);margin:14px 0 10px;">If everything looks right, hit Build. If not, click Make Changes to go back.</div>'
          +'<div style="display:flex;gap:10px;">'
          +'<button class="clarify-build-btn" style="padding:10px 24px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit;box-shadow:0 2px 8px rgba(16,185,129,0.3);">&#x1F680; Build it!</button>'
          +'<button class="clarify-revise-btn" style="padding:10px 24px;background:rgba(255,255,255,0.06);color:var(--vscode-descriptionForeground);border:1px solid rgba(255,255,255,0.1);border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;">Make changes</button>'
          +'</div>';
      }
    }
  `;
}
