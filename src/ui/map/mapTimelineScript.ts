// [SCOPE] Architecture Map Timeline Script — chronological activity feed
// Replaces the canvas-based timeline. Renders HTML cards from TIMELINE_DATA.
// [WARN] Pure JS string injected into WebView via external <script src> file. No TypeScript.

export const MAP_TIMELINE_SCRIPT = `
(function() {
  var feed = document.getElementById('tl-feed');
  var empty = document.getElementById('tl-empty');
  if (!feed) return;

  var data = window.TIMELINE_DATA || {};
  var history = (data.history || []).slice().sort(function(a, b) {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
  var spIds = new Set((data.savePoints || []).map(function(sp) { return sp.id; }));

  if (history.length === 0) {
    feed.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    return;
  }

  history.forEach(function(entry) {
    var isSP   = spIds.has(entry.id);
    var isVault = entry.source === 'vault';
    var isFix  = entry.task && /^fix\\b/i.test(entry.task.trim());
    var isEdit = entry.task && /^\\[EDIT\\]/i.test(entry.task.trim());
    var isUndone = !!entry.undone;

    var label, color, bg;
    if (isUndone)       { label = 'Undone';      color = '#6c7086'; bg = 'rgba(108,112,134,0.12)'; }
    else if (isSP)      { label = 'Save Point';  color = '#f5c400'; bg = 'rgba(245,196,0,0.12)'; }
    else if (isVault)   { label = 'Vault Build'; color = '#4ec959'; bg = 'rgba(78,201,89,0.12)'; }
    else if (isEdit)    { label = 'Edit';        color = '#a78bfa'; bg = 'rgba(167,139,250,0.12)'; }
    else if (isFix)     { label = 'Fix';         color = '#fb923c'; bg = 'rgba(251,146,60,0.12)'; }
    else                { label = 'Build';       color = '#4a9eff'; bg = 'rgba(74,158,255,0.12)'; }

    var ts = new Date(entry.timestamp);
    var dateStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    var timeStr = ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    var files = (entry.files || []).slice(0, 6);
    var extra = (entry.files || []).length - files.length;
    var filesHtml = files.length > 0
      ? '<div class="tl-files">'
        + files.map(function(f) { return '<span class="tl-file">' + f + '</span>'; }).join('')
        + (extra > 0 ? '<span class="tl-more">+' + extra + ' more</span>' : '')
        + '</div>'
      : '';

    var metaHtml = entry.tokensUsed
      ? '<div class="tl-meta">~' + entry.tokensUsed.toLocaleString() + ' tokens'
        + (entry.costUSD ? ' &middot; $' + Number(entry.costUSD).toFixed(4) : '')
        + (entry.supervisor ? ' &middot; ' + entry.supervisor : '')
        + '</div>'
      : '';

    var task = (entry.task || '(Unknown)').replace(/^\[EDIT\]\s*/i, '').replace(/^\[FIX\]\s*/i, '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    var card = document.createElement('div');
    card.className = 'tl-card' + (isUndone ? ' tl-card-undone' : '');
    card.innerHTML =
      '<div class="tl-card-head">'
      + '<span class="tl-badge" style="color:' + color + ';background:' + bg + '">' + label + '</span>'
      + '<span class="tl-ts">' + dateStr + ' &middot; ' + timeStr + '</span>'
      + '</div>'
      + '<div class="tl-task">' + task + '</div>'
      + filesHtml
      + metaHtml;
    feed.appendChild(card);
  });
})();
`;
