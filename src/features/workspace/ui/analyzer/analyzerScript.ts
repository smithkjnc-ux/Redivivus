// [SCOPE] Recommendations panel webview script — event handlers and assembly
// Helper functions (variables, startNextInQueue, showToast) -> analyzerScriptHead.ts

import { RECOMMENDATIONS_SCRIPT_HEAD } from './analyzerScriptHead.js';

const RECOMMENDATIONS_SCRIPT_TAIL = `
  window.addEventListener('message', function(e) {
    const msg = e.data;
    if (msg.type === 'verifyFixResult' && msg.result) {
      const rows = document.querySelectorAll('.item-row, li');
      const row = rows[parseInt(msg.rowId || '0')];
      if (!row) { return; }
      const doneBtn = row.querySelector('.done-btn');
      if (doneBtn) { doneBtn.classList.remove('working'); }
      if (msg.result.fixed) {
        row.classList.add('resolved');
        const badge = document.createElement('span');
        badge.className = 'resolved-badge';
        badge.textContent = String.fromCodePoint(0x2705) + ' Fixed';
        row.appendChild(badge);
        if (doneBtn) { doneBtn.remove(); }
        const fixBtn = row.querySelector('.fix-btn');
        if (fixBtn) { fixBtn.classList.remove('working'); fixBtn.classList.add('done'); fixBtn.textContent = String.fromCodePoint(0x2705) + ' Done'; }
        updateDoneCount();
      } else {
        const reason = msg.result.reason || 'Verification failed';
        const fixBtn = row.querySelector('.fix-btn');
        if (fixBtn) { fixBtn.classList.remove('working'); fixBtn.classList.add('failed'); fixBtn.textContent = String.fromCodePoint(0x274C) + ' Failed'; }
        if (doneBtn) { doneBtn.textContent = String.fromCodePoint(0x274C) + ' Failed'; }
        showToast(String.fromCodePoint(0x274C) + ' Not fixed yet: ' + reason, 6000);
      }
    } else if (msg.type === 'buildStarted') {
      const fileName = msg.fileName || '';
      if (!fileName.startsWith('batch-')) {
        showToast(String.fromCodePoint(0x1F527) + ' Fix started' + (fileName ? ' for ' + fileName : '') + ' -- watch the Chat panel for progress', 5000);
      }
    } else if (msg.type === 'buildFailed') {
      clearWatchdog();
      const working = document.querySelector('.fix-btn.working, .fix-btn.pending');
      if (working) { working.classList.remove('working', 'pending'); working.classList.add('failed'); working.textContent = String.fromCodePoint(0x274C) + ' Timed out -- retry?'; }
      if (fixAllQueue.length > 0) {
        const done = fixAllTotal - fixAllQueue.length;
        if (fixAllStatus) { fixAllStatus.textContent = 'Item ' + done + ' timed out -- skipping to next...'; }
        setTimeout(startNextInQueue, 1500);
      } else if (fixAllBtn) {
        fixAllBtn.classList.remove('running'); fixAllBtn.classList.add('done'); fixAllBtn.textContent = 'Done (some items timed out)';
        showToast('Fix All finished with timeouts. Check the Chat panel for details.', 7000);
        fixAllBtn = null; fixAllStatus = null;
      } else {
        showToast(String.fromCodePoint(0x274C) + ' Fix timed out. Try a shorter prompt or check your API key.', 6000);
      }
    } else if (msg.type === 'buildFinished') {
      clearWatchdog();
      const builtFiles = msg.builtFiles || [];
      const task = msg.task || '';
      const fileNames = [...builtFiles];
      const taskMatch = task.match(/(?:Fix|Split|at|of)\\s+([^\\s\\(\\):]+)/i);
      if (taskMatch && !fileNames.includes(taskMatch[1])) { fileNames.push(taskMatch[1]); }
      var matchedBtnCount = 0;
      fileNames.forEach(function(fileName) {
        if (!fileName) { return; }
        const selector = '.fix-btn[data-file*="' + fileName + '"]';
        document.querySelectorAll(selector).forEach(function(btn) {
          matchedBtnCount++;
          btn.classList.remove('pending', 'working'); btn.classList.add('done'); btn.textContent = String.fromCodePoint(0x2705) + ' Fixed!';
          const fp = btn.getAttribute('data-file'); const it = btn.getAttribute('data-issue') || 'largeFile';
          if (fp) { vscode.postMessage({ type: 'markResolved', filePath: fp, issueType: it }); }
        });
      });
      if (matchedBtnCount === 0) {
        const btn = document.querySelector('.fix-btn.pending') || document.querySelector('.fix-btn.working');
        if (btn) {
          btn.classList.remove('pending', 'working'); btn.classList.add('done'); btn.textContent = String.fromCodePoint(0x2705) + ' Fixed!';
          const fp = btn.getAttribute('data-file'); const it = btn.getAttribute('data-issue') || fixAllIssueType || 'largeFile';
          if (fp) { vscode.postMessage({ type: 'markResolved', filePath: fp, issueType: it }); }
        }
      }
      if (fixAllQueue.length > 0) { setTimeout(startNextInQueue, 800); }
      else if (fixAllBtn) { startNextInQueue(); }
      else { showToast(String.fromCodePoint(0x2705) + ' Fix complete!', 4000); }
    } else if (msg.type === 'clipboardError') {
      const btn = document.querySelector('.fix-btn.working');
      if (btn) { btn.classList.remove('working'); btn.classList.add('failed'); btn.textContent = String.fromCodePoint(0x274C) + ' Failed'; }
      showToast(String.fromCodePoint(0x274C) + ' Failed to start fix', 4000);
      if (fixAllQueue.length > 0) { setTimeout(startNextInQueue, 1500); }
    }
  });

  document.addEventListener('click', function(e) {
    const allBtn = e.target.closest('.fix-all-btn');
    if (allBtn) {
      if (allBtn.classList.contains('running') || allBtn.classList.contains('done')) { return; }
      let prompts;
      try { prompts = JSON.parse(allBtn.getAttribute('data-prompts') || '[]'); } catch { prompts = []; }
      if (prompts.length === 0) { return; }
      fixAllQueue = [...prompts]; fixAllTotal = prompts.length; fixAllBtn = allBtn;
      fixAllIssueType = allBtn.getAttribute('data-issue') || 'largeFile';
      fixAllStatus = allBtn.parentElement && allBtn.parentElement.querySelector('.fix-all-status');
      allBtn.classList.add('running'); allBtn.textContent = String.fromCodePoint(0x26A1) + ' Starting Fix All...';
      showToast(String.fromCodePoint(0x26A1) + ' Fix All started -- AI will work through each item. Watch the Chat panel.', 5000);
      startNextInQueue(); return;
    }
    const doneBtn = e.target.closest('.done-btn');
    if (doneBtn) {
      const filePath = doneBtn.getAttribute('data-file'); const issueType = doneBtn.getAttribute('data-issue');
      const row = doneBtn.closest('.item-row, li');
      if (!filePath || !issueType || !row || row.classList.contains('resolved')) { return; }
      vscode.postMessage({ type: 'markResolved', filePath: filePath, issueType: issueType });
      doneBtn.dataset.rowId = Array.from((row.parentElement && row.parentElement.children) || []).indexOf(row).toString();
      doneBtn.classList.add('working'); doneBtn.textContent = String.fromCodePoint(0x1F504) + ' Verifying...';
      vscode.postMessage({ type: 'verifyFix', filePath: filePath, issueType: issueType, rowId: doneBtn.dataset.rowId }); return;
    }
    const btn = e.target.closest('.fix-btn');
    if (!btn || btn.classList.contains('done') || btn.classList.contains('working')) { return; }
    const prompt = btn.getAttribute('data-prompt'); const fileName = btn.getAttribute('data-file') || 'this item';
    btn.classList.add('working'); btn.classList.remove('copied', 'pending', 'done', 'failed');
    btn.textContent = String.fromCodePoint(0x1F527) + ' Fixing ' + (fileName !== 'this item' ? fileName.split('/').pop() : 'item') + '...';
    vscode.postMessage({ type: 'sendToChat', prompt: prompt, fileName: fileName, issueType: btn.getAttribute('data-issue') || 'largeFile' });
  });

  function updateDoneCount() {
    const total = document.querySelectorAll('.item-row').length;
    const done = document.querySelectorAll('.item-row.resolved').length;
    if (done === 0) { return; }
    let counter = document.getElementById('done-counter');
    if (!counter) {
      counter = document.createElement('div'); counter.id = 'done-counter';
      counter.style.cssText = 'position:fixed;top:12px;right:16px;background:rgba(78,201,89,0.15);border:1px solid rgba(78,201,89,0.4);color:#4ec959;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;z-index:999;';
      document.body.appendChild(counter);
    }
    counter.textContent = String.fromCodePoint(0x2705) + ' ' + done + ' of ' + total + ' fixed';
  }
})();
</script>
`;

export const RECOMMENDATIONS_SCRIPT = RECOMMENDATIONS_SCRIPT_HEAD + RECOMMENDATIONS_SCRIPT_TAIL;
