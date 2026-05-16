// [SCOPE] Chat Panel Webview Script — Expanded 5W Interview panel
// Shows a single-page 5-section form for WHO/WHAT/WHERE/WHEN/WHY requirements capture.
// Rule 13: ASCII only — no emoji literals in injected JS.

export function buildExpandedInterviewScript(): string {
  return `
    function showExpandedInterviewPanel(prefillTask, complexity) {
      if (document.getElementById('ei-root')) { return; }
      var root = document.createElement('div'); root.id = 'ei-root';
      root.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;background:var(--vscode-editor-background);display:flex;flex-direction:column;z-index:99999;font-family:inherit;';

      var sections = [
        { key: 'who', label: 'WHO -- Who are the users?', questions: [
          { id: 'who-skill', q: 'Skill level of users?', type: 'choice', choices: ['Technical/Developers','Intermediate (some tech knowledge)','Beginners (minimal tech knowledge)','Mixed audience'], required: true },
          { id: 'who-type', q: 'Internal team or public customers?', type: 'choice', choices: ['Internal team only','External customers/clients','Both internal and external','Not sure yet'], required: true }
        ]},
        { key: 'what', label: 'WHAT -- What does it do?', questions: [
          { id: 'what-core', q: 'In one sentence, what is the core function?', type: 'text', placeholder: 'e.g., A multiplayer guessing game where players draw and guess words', required: true },
          { id: 'what-features', q: 'List the 3-5 most important features', type: 'text', placeholder: 'e.g., Real-time drawing, Chat, Score tracking, Room creation', required: true }
        ]},
        { key: 'where', label: 'WHERE -- What platform?', questions: [
          { id: 'where-platform', q: 'Target platform(s)?', type: 'choice', choices: ['Web browser','Mobile app (iOS/Android)','Desktop app (Windows/Mac)','Multiple platforms','Backend/API only'], required: true }
        ]},
        { key: 'when', label: 'WHEN -- What is the timeline?', questions: [
          { id: 'when-timeline', q: 'Overall timeline?', type: 'choice', choices: ['Today (single session)','This week','This month','This quarter','6+ months'], required: true }
        ]},
        { key: 'why', label: 'WHY -- What problem does it solve?', questions: [
          { id: 'why-problem', q: 'What specific problem does this solve?', type: 'text', placeholder: 'e.g., Current tools are too expensive, too slow, or missing X feature', required: true }
        ]}
      ];

      var headerHtml = '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid var(--vscode-editorGroup-border);flex-shrink:0;">'
        + '<div><div style="font-size:14px;font-weight:700;color:var(--vscode-foreground);">Project Requirements Interview</div>'
        + '<div style="font-size:11px;color:var(--vscode-descriptionForeground);">5 questions -- 2 minutes -- better builds</div></div>'
        + '<button id="ei-close" style="background:none;border:none;color:var(--vscode-descriptionForeground);cursor:pointer;font-size:20px;padding:2px 6px;border-radius:4px;" title="Close">&#x2715;</button>'
        + '</div>';

      var bodyHtml = '<div style="flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:24px;">';
      if (prefillTask) {
        bodyHtml += '<div style="padding:10px 14px;background:var(--vscode-input-background);border-radius:6px;border-left:3px solid #a855f7;font-size:12px;color:var(--vscode-foreground);">'
          + '<span style="color:var(--vscode-descriptionForeground);">Building:</span> ' + prefillTask.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>';
      }
      sections.forEach(function(section) {
        bodyHtml += '<div><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#a855f7;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--vscode-editorGroup-border);">' + section.label + '</div>';
        section.questions.forEach(function(q) {
          bodyHtml += '<div style="margin-bottom:14px;">';
          bodyHtml += '<div style="font-size:13px;font-weight:600;color:var(--vscode-foreground);margin-bottom:6px;">' + (q.required ? '' : '<span style="font-size:10px;font-weight:400;color:var(--vscode-descriptionForeground);">(optional) </span>') + q.q + '</div>';
          if (q.type === 'choice') {
            bodyHtml += '<div id="ei-' + q.id + '" style="display:flex;flex-direction:column;gap:5px;">';
            q.choices.forEach(function(c) {
              var safe = c.replace(/"/g, '&quot;');
              bodyHtml += '<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;border:1px solid var(--vscode-input-border);cursor:pointer;font-size:12px;">'
                + '<input type="radio" name="ei-' + q.id + '" value="' + safe + '" style="accent-color:#a855f7;width:14px;height:14px;flex-shrink:0;"> ' + c + '</label>';
            });
            bodyHtml += '</div>';
          } else {
            bodyHtml += '<textarea id="ei-' + q.id + '" rows="3" style="display:block;width:100%;box-sizing:border-box;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);color:var(--vscode-foreground);border-radius:6px;padding:8px 10px;font-size:12px;line-height:1.5;resize:vertical;font-family:inherit;" placeholder="' + (q.placeholder || '').replace(/"/g,'&quot;') + '"></textarea>';
          }
          bodyHtml += '</div>';
        });
        bodyHtml += '</div>';
      });
      bodyHtml += '</div>';

      var footerHtml = '<div style="padding:12px 20px;border-top:1px solid var(--vscode-editorGroup-border);display:flex;gap:10px;justify-content:flex-end;flex-shrink:0;">'
        + '<button id="ei-skip" style="background:none;border:1px solid var(--vscode-input-border);color:var(--vscode-descriptionForeground);padding:8px 16px;border-radius:6px;cursor:pointer;font-size:12px;">Skip -- build with defaults</button>'
        + '<button id="ei-submit" style="background:#a855f7;border:none;color:#fff;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;">Build It &#8594;</button>'
        + '</div>';

      root.innerHTML = headerHtml + bodyHtml + footerHtml;
      document.body.appendChild(root); document.body.style.overflow = 'hidden';

      document.getElementById('ei-close').onclick = function() { root.remove(); document.body.style.overflow = ''; };
      document.getElementById('ei-skip').onclick = function() {
        root.remove(); document.body.style.overflow = '';
        if (prefillTask) { vscode.postMessage({ type: 'expanded-interview-submit', answers: {}, prefillTask: prefillTask, skipped: true }); }
      };
      document.getElementById('ei-submit').onclick = function() {
        var answers = {};
        sections.forEach(function(section) {
          section.questions.forEach(function(q) {
            if (q.type === 'choice') {
              var sel = document.querySelector('input[name="ei-' + q.id + '"]:checked');
              if (sel) { answers[q.id] = sel.value; }
            } else {
              var el = document.getElementById('ei-' + q.id);
              if (el && el.value.trim()) { answers[q.id] = el.value.trim(); }
            }
          });
        });
        root.remove(); document.body.style.overflow = '';
        vscode.postMessage({ type: 'expanded-interview-submit', answers: answers, prefillTask: prefillTask || '', skipped: false });
      };
    }
  `;
}
