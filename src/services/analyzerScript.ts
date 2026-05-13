// [SCOPE] Recommendations panel webview script logic
export const RECOMMENDATIONS_SCRIPT = `
<script>
(function() {
  const vscode = acquireVsCodeApi();
  if (!vscode) { console.error('CHASSIS: Failed to acquire VS Code API'); }

  const toast = document.getElementById('toast');
  let toastTimer;

  // ── Fix All sequential queue ─────────────────────────────────────
  // [SCOPE] Holds state for the current Fix All job (one section at a time)
  let fixAllQueue = [];       // remaining prompts to send
  let fixAllBtn = null;       // the active Fix All button
  let fixAllStatus = null;    // the status span beside it
  let fixAllTotal = 0;        // total prompts in this batch
  let fixAllIssueType = '';   // issue type for persistence
  let fixAllWatchdog = null;  // safety timer — advances queue if AI never responds

  function clearWatchdog() { if (fixAllWatchdog) { clearTimeout(fixAllWatchdog); fixAllWatchdog = null; } }

  function startNextInQueue() {
    if (fixAllQueue.length === 0) {
      // All done — update UI
      if (fixAllBtn) {
        fixAllBtn.classList.remove('running');
        fixAllBtn.classList.add('done');
        fixAllBtn.textContent = '✅ All done!';
      }
      if (fixAllStatus) { fixAllStatus.textContent = fixAllTotal + ' of ' + fixAllTotal + ' complete'; }
      showToast('✅ Fix All complete — ' + fixAllTotal + ' items finished!', 6000);
      fixAllBtn = null; fixAllStatus = null;
      return;
    }
    const prompt = fixAllQueue.shift();
    const done = fixAllTotal - fixAllQueue.length;
    if (fixAllStatus) { fixAllStatus.textContent = 'Working on ' + done + ' of ' + fixAllTotal + '...'; }
    if (fixAllBtn) { fixAllBtn.textContent = '⚡ Fixing ' + done + ' / ' + fixAllTotal + '...'; }
    // Find a pending fix-btn in this section and mark it working
    const btn = document.querySelector('.fix-btn:not(.done):not(.working)');
    if (btn) {
      btn.classList.add('working');
      const fn = btn.getAttribute('data-file') || 'item';
      btn.textContent = '🔧 Fixing ' + fn.split('/').pop() + '...';
    }
    const issueType = fixAllIssueType || 'largeFile';
    vscode.postMessage({ type: 'sendToChat', prompt, fileName: 'batch-' + done, issueType });
    // Watchdog: if no buildFinished/buildFailed within 3 min, skip this item and continue
    clearWatchdog();
    fixAllWatchdog = setTimeout(function() {
      fixAllWatchdog = null;
      const working = document.querySelector('.fix-btn.working, .fix-btn.pending');
      if (working) { working.classList.remove('working','pending'); working.classList.add('failed'); working.textContent = '⏱ Timed out'; }
      const _done = fixAllTotal - fixAllQueue.length;
      if (fixAllStatus) { fixAllStatus.textContent = '⚠️ Item ' + _done + ' timed out — skipping...'; }
      setTimeout(startNextInQueue, 1000);
    }, 180000);
  }
  // ─────────────────────────────────────────────────────────────────

  function showToast(msg, duration) {
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.display = 'none'; }, duration || 4000);
  }

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'verifyFixResult' && msg.result) {
      const rows = document.querySelectorAll('.item-row, li');
      const row = rows[parseInt(msg.rowId || '0')];
      if (!row) return;
      const doneBtn = row.querySelector('.done-btn');
      if (doneBtn) { doneBtn.classList.remove('working'); }
      if (msg.result.fixed) {
        row.classList.add('resolved');
        const badge = document.createElement('span');
        badge.className = 'resolved-badge';
        badge.textContent = '✅ Fixed';
        row.appendChild(badge);
        if (doneBtn) doneBtn.remove();
        const fixBtn = row.querySelector('.fix-btn');
        if (fixBtn) { fixBtn.classList.remove('working'); fixBtn.classList.add('done'); fixBtn.textContent = '✅ Done'; }
        updateDoneCount();
      } else {
        const reason = msg.result.reason || 'Verification failed';
        const fixBtn = row.querySelector('.fix-btn');
        if (fixBtn) { fixBtn.classList.remove('working'); fixBtn.classList.add('failed'); fixBtn.textContent = '❌ Failed'; }
        if (doneBtn) { doneBtn.textContent = '❌ Failed'; }
        showToast('❌ Not fixed yet: ' + reason, 6000);
      }

    } else if (msg.type === 'buildStarted') {
      const fileName = msg.fileName || '';
      // Don't show toast for batch jobs — the Fix All bar shows progress instead
      if (!fileName.startsWith('batch-')) {
        showToast('🔧 Fix started' + (fileName ? ' for ' + fileName : '') + ' — watch the Chat panel for progress', 5000);
      }

    } else if (msg.type === 'buildFailed') {
      clearWatchdog();
      // [CHASSIS] A build timed out or errored — unfreeze any working buttons, advance Fix All queue
      const working = document.querySelector('.fix-btn.working, .fix-btn.pending');
      if (working) {
        working.classList.remove('working', 'pending');
        working.classList.add('failed');
        working.textContent = '❌ Timed out — retry?';
      }
      if (fixAllQueue.length > 0) {
        // Advance to next item in batch — skip this one
        const done = fixAllTotal - fixAllQueue.length;
        if (fixAllStatus) { fixAllStatus.textContent = '⚠️ Item ' + done + ' timed out — skipping to next...'; }
        setTimeout(startNextInQueue, 1500);
      } else if (fixAllBtn) {
        // Was the last item — end the batch with a warning
        fixAllBtn.classList.remove('running');
        fixAllBtn.classList.add('done');
        fixAllBtn.textContent = '⚠️ Done (some items timed out)';
        showToast('⚠️ Fix All finished with timeouts. Check the Chat panel for details.', 7000);
        fixAllBtn = null; fixAllStatus = null;
      } else {
        showToast('❌ Fix timed out. Try a shorter prompt or check your API key.', 6000);
      }

    } else if (msg.type === 'buildFinished') {
      clearWatchdog();
      const builtFiles = msg.builtFiles || [];
      const task = msg.task || '';
      const fileNames = [...builtFiles];
      const taskMatch = task.match(/(?:Fix|Split|at|of)\\s+([^\\s\\(\\):]+)/i);
      if (taskMatch && !fileNames.includes(taskMatch[1])) { fileNames.push(taskMatch[1]); }
      fileNames.forEach(fileName => {
        if (!fileName) return;
        const selector = ".fix-btn[data-file*=\\"" + fileName + "\\"]";
        document.querySelectorAll(selector).forEach(btn => {
          btn.classList.remove('pending', 'working');
          btn.classList.add('done');
          btn.textContent = '✅ Fixed!';
          const fp = btn.getAttribute('data-file');
          const it = btn.getAttribute('data-issue') || 'largeFile';
          if (fp) { vscode.postMessage({ type: 'markResolved', filePath: fp, issueType: it }); }
        });
      });
      if (fileNames.length === 0) {
        const btn = document.querySelector('.fix-btn.pending') || document.querySelector('.fix-btn.working');
        if (btn) {
          btn.classList.remove('pending', 'working'); btn.classList.add('done');
          btn.textContent = '✅ Fixed!';
          const fp = btn.getAttribute('data-file');
          const it = btn.getAttribute('data-issue') || fixAllIssueType || 'largeFile';
          if (fp) { vscode.postMessage({ type: 'markResolved', filePath: fp, issueType: it }); }
        }
      }
      // If a Fix All batch is running, fire the next one
      if (fixAllQueue.length > 0) {
        setTimeout(startNextInQueue, 800);
      } else if (fixAllBtn) {
        // Last item just finished
        startNextInQueue();
      } else {
        showToast('✅ Fix complete!', 4000);
      }

    } else if (msg.type === 'clipboardError') {
      const btn = document.querySelector('.fix-btn.working');
      if (btn) { btn.classList.remove('working'); btn.classList.add('failed'); btn.textContent = '❌ Failed'; }
      showToast('❌ Failed to start fix', 4000);
      // If batch running, still try next
      if (fixAllQueue.length > 0) { setTimeout(startNextInQueue, 1500); }
    }
  });

  document.addEventListener('click', e => {
    // ── Fix All button ──────────────────────────────────────────────
    const allBtn = e.target.closest('.fix-all-btn');
    if (allBtn) {
      if (allBtn.classList.contains('running') || allBtn.classList.contains('done')) { return; }
      let prompts;
      try { prompts = JSON.parse(allBtn.getAttribute('data-prompts') || '[]'); } catch { prompts = []; }
      if (prompts.length === 0) { return; }
      fixAllQueue = [...prompts];
      fixAllTotal = prompts.length;
      fixAllBtn = allBtn;
      fixAllIssueType = allBtn.getAttribute('data-issue') || 'largeFile';
      fixAllStatus = allBtn.parentElement?.querySelector('.fix-all-status');
      allBtn.classList.add('running');
      allBtn.textContent = '⚡ Starting Fix All...';
      showToast('⚡ Fix All started — AI will work through each item. Watch the Chat panel.', 5000);
      startNextInQueue();
      return;
    }

    // ── Done button ─────────────────────────────────────────────────
    const doneBtn = e.target.closest('.done-btn');
    if (doneBtn) {
      const filePath = doneBtn.getAttribute('data-file');
      const issueType = doneBtn.getAttribute('data-issue');
      const row = doneBtn.closest('.item-row, li');
      if (!filePath || !issueType || !row || row.classList.contains('resolved')) { return; }
      vscode.postMessage({ type: 'markResolved', filePath, issueType });
      doneBtn.dataset.rowId = Array.from(row.parentElement?.children || []).indexOf(row).toString();
      doneBtn.classList.add('working'); doneBtn.textContent = '🔄 Verifying...';
      vscode.postMessage({ type: 'verifyFix', filePath, issueType, rowId: doneBtn.dataset.rowId });
      return;
    }

    // ── Individual Fix button ───────────────────────────────────────
    const btn = e.target.closest('.fix-btn');
    if (!btn || btn.classList.contains('done') || btn.classList.contains('working')) { return; }
    const prompt = btn.getAttribute('data-prompt');
    const fileName = btn.getAttribute('data-file') || 'this item';
    btn.classList.add('working'); btn.classList.remove('copied', 'pending', 'done', 'failed');
    btn.textContent = '🔧 Fixing ' + (fileName !== 'this item' ? fileName.split('/').pop() : 'item') + '...';
    const issueType = btn.getAttribute('data-issue') || 'largeFile';
    vscode.postMessage({ type: 'sendToChat', prompt, fileName, issueType });
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
    counter.textContent = '✅ ' + done + ' of ' + total + ' fixed';
  }
})();
</script>
`;
