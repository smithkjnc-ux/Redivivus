// [SCOPE] Recommendations panel webview script — variable declarations and helper functions
// Combined with analyzerScript.ts by: RECOMMENDATIONS_SCRIPT = RECOMMENDATIONS_SCRIPT_HEAD + RECOMMENDATIONS_SCRIPT_TAIL

export const RECOMMENDATIONS_SCRIPT_HEAD = `
<script>
(function() {
  const vscode = acquireVsCodeApi();
  if (!vscode) { console.error('Redivivus: Failed to acquire VS Code API'); }

  const toast = document.getElementById('toast');
  let toastTimer;

  let fixAllQueue = [];
  let fixAllBtn = null;
  let fixAllStatus = null;
  let fixAllTotal = 0;
  let fixAllIssueType = '';
  let fixAllWatchdog = null;

  function clearWatchdog() { if (fixAllWatchdog) { clearTimeout(fixAllWatchdog); fixAllWatchdog = null; } }

  function startNextInQueue() {
    if (fixAllQueue.length === 0) {
      if (fixAllBtn) { fixAllBtn.classList.remove('running'); fixAllBtn.classList.add('done'); fixAllBtn.textContent = String.fromCodePoint(0x2705) + ' All done!'; }
      if (fixAllStatus) { fixAllStatus.textContent = fixAllTotal + ' of ' + fixAllTotal + ' complete'; }
      showToast(String.fromCodePoint(0x2705) + ' Fix All complete -- ' + fixAllTotal + ' items finished!', 6000);
      fixAllBtn = null; fixAllStatus = null;
      return;
    }
    const prompt = fixAllQueue.shift();
    const done = fixAllTotal - fixAllQueue.length;
    if (fixAllStatus) { fixAllStatus.textContent = 'Working on ' + done + ' of ' + fixAllTotal + '...'; }
    if (fixAllBtn) { fixAllBtn.textContent = String.fromCodePoint(0x26A1) + ' Fixing ' + done + ' / ' + fixAllTotal + '...'; }
    const btn = document.querySelector('.fix-btn:not(.done):not(.working)');
    if (btn) {
      btn.classList.add('working');
      const fn = btn.getAttribute('data-file') || 'item';
      btn.textContent = String.fromCodePoint(0x1F527) + ' Fixing ' + fn.split('/').pop() + '...';
    }
    const issueType = fixAllIssueType || 'largeFile';
    vscode.postMessage({ type: 'sendToChat', prompt: prompt, fileName: 'batch-' + done, issueType: issueType });
    clearWatchdog();
    fixAllWatchdog = setTimeout(function() {
      fixAllWatchdog = null;
      const working = document.querySelector('.fix-btn.working, .fix-btn.pending');
      if (working) { working.classList.remove('working','pending'); working.classList.add('failed'); working.textContent = 'Timed out'; }
      const _done = fixAllTotal - fixAllQueue.length;
      if (fixAllStatus) { fixAllStatus.textContent = 'Item ' + _done + ' timed out -- skipping...'; }
      setTimeout(startNextInQueue, 1000);
    }, 180000);
  }

  function showToast(msg, duration) {
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { toast.style.display = 'none'; }, duration || 4000);
  }
`;
