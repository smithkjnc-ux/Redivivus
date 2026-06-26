// [SCOPE] Clarify card renderer — data-driven, one question in DOM at a time
// All questions stored as JSON in data-questions attr; JS renders and swaps each one.
// No display:none toggling — only the current question is ever in the DOM.

type ClarifyOpt = { label: string };
type ClarifyQ = { id: string; question: string; options: ClarifyOpt[]; freeText?: boolean };

function escQ(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderQuestion(q: ClarifyQ, idx: number): string {
  const numBadge = `<span style="display:flex;align-items:center;justify-content:center;min-width:26px;height:26px;border-radius:50%;background:rgba(59,130,246,0.15);color:#3b82f6;font-size:12px;font-weight:700;flex-shrink:0;">${idx + 1}</span>`;
  const titleRow = `<div style="font-size:13px;font-weight:700;color:var(--vscode-foreground);margin-bottom:14px;display:flex;align-items:flex-start;gap:12px;line-height:1.5;">${numBadge}<span style="padding-top:3px;">${escQ(q.question)}</span></div>`;
  if (q.freeText) {
    return `<div class="clarify-q-inner">${titleRow}<div style="margin-left:38px;"><textarea class="clarify-freetext" data-qid="${escQ(q.id)}" placeholder="Optional — share any other preferences, themes, or specific requirements..." rows="3" style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 12px;color:var(--vscode-foreground);font-family:inherit;font-size:12.5px;resize:vertical;outline:none;box-sizing:border-box;"></textarea></div></div>`;
  }
  const opts = q.options.map((opt, oIdx) =>
    `<label class="clarify-option" style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-radius:8px;cursor:pointer;font-size:12.5px;color:var(--vscode-foreground);border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);margin-bottom:8px;">`
    + `<input type="radio" name="clarify-${escQ(q.id)}" class="clarify-radio" data-qid="${escQ(q.id)}" value="${escQ(opt.label)}" ${oIdx === 0 ? 'checked' : ''} style="margin:2px 0 0 0;accent-color:#3b82f6;width:15px;height:15px;flex-shrink:0;">`
    + `<span style="line-height:1.45;">${escQ(opt.label)}</span></label>`
  ).join('');
  const elaborate = `<div style="margin-top:10px;margin-left:0;"><textarea class="clarify-elaborate" data-qid="${escQ(q.id)}" placeholder="Want to add more detail? (optional)" rows="2" style="width:100%;background:rgba(255,255,255,0.03);border:1px dashed rgba(255,255,255,0.08);border-radius:8px;padding:8px 12px;font-family:inherit;font-size:12px;resize:vertical;outline:none;box-sizing:border-box;color:var(--vscode-descriptionForeground);"></textarea></div>`;
  return `<div class="clarify-q-inner">${titleRow}<div style="margin-left:38px;display:flex;flex-direction:column;">${opts}</div><div style="margin-left:38px;">${elaborate}</div></div>`;
}

export function renderClarifyCard(questions: ClarifyQ[]): string {
  if (!questions.length) {return '';}
  const total = questions.length;
  const qJson = JSON.stringify(questions).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const nextLabel = total === 1 ? 'Submit &amp; Build &#x2192;' : 'Next &#x2192;';
  const btnStyle = `padding:10px 24px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit;box-shadow:0 2px 8px rgba(59,130,246,0.3);`;
  const cancelStyle = `padding:10px 24px;background:rgba(255,255,255,0.06);color:var(--vscode-descriptionForeground);border:1px solid rgba(255,255,255,0.1);border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;`;
  return `<div class="clarify-card" data-questions="${qJson}" data-current-q="0" data-total-q="${total}" style="background:linear-gradient(135deg,rgba(30,35,50,0.95),rgba(25,28,40,0.98));border:1px solid rgba(59,130,246,0.2);border-radius:12px;padding:28px 32px;margin-bottom:14px;box-shadow:0 4px 20px rgba(0,0,0,0.25);">`
    + `<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">`
    + `<div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;background:rgba(59,130,246,0.12);"><span style="font-size:18px;">&#x1F4CB;</span></div>`
    + `<div><div style="font-size:15px;font-weight:700;color:var(--vscode-foreground);">Build Setup</div>`
    + `<div class="clarify-progress" style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:3px;">Question 1 of ${total}</div></div></div>`
    + `<div class="clarify-q-wrap">${renderQuestion(questions[0], 0)}</div>`
    + `<div class="clarify-summary" style="display:none;"></div>`
    + `<div class="clarify-nav" style="display:flex;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);">`
    + `<button class="clarify-next-btn" style="${btnStyle}">${nextLabel}</button>`
    + `<button class="clarify-cancel-btn" style="${cancelStyle}">Cancel</button></div>`
    + `<style>.clarify-option:hover{background:rgba(59,130,246,0.08)!important;border-color:rgba(59,130,246,0.2)!important;}`
    + `.clarify-option:has(input:checked){background:rgba(59,130,246,0.1)!important;border-color:rgba(59,130,246,0.3)!important;}`
    + `.clarify-next-btn:hover{filter:brightness(1.1);transform:translateY(-1px);}`
    + `.clarify-cancel-btn:hover{background:rgba(255,255,255,0.1);color:var(--vscode-foreground)!important;}`
    + `.clarify-freetext:focus,.clarify-elaborate:focus{border-color:rgba(59,130,246,0.4)!important;background:rgba(255,255,255,0.06)!important;}</style>`;
}
