// [SCOPE] Chat Panel Tier Badge — real-time model tier indicator shown before the user sends.
// Assesses message complexity client-side (zero tokens, zero latency) and shows which Claude
// model tier will handle the request. User can click to override before sending.
// Tiers: flash=Haiku (quick), pro=Sonnet (standard), ultra=Opus (deep reasoning).

export function buildTierScript(): string {
  return `
    (function() {
      var _tierOverride = null; // null = auto, 'flash'|'pro'|'ultra' = user-forced
      var TIER = {
        flash: { icon: '\\u26A1', label: 'Haiku',  hint: 'quick answer',    color: '#14B8A6' },
        pro:   { icon: '\\u25C6', label: 'Sonnet', hint: 'standard',         color: '#8888aa' },
        ultra: { icon: '\\u2736', label: 'Opus',   hint: 'deep reasoning',   color: '#f59e0b' },
      };

      // Tiny Levenshtein — handles typos up to 2 edits (implicatons, architectue, etc.)
      function lev(a, b) {
        if (Math.abs(a.length - b.length) > 3) return 99;
        var d = [], i, j;
        for (i = 0; i <= a.length; i++) { d[i] = [i]; }
        for (j = 0; j <= b.length; j++) { d[0][j] = j; }
        for (i = 1; i <= a.length; i++)
          for (j = 1; j <= b.length; j++)
            d[i][j] = a[i-1] === b[j-1] ? d[i-1][j-1] : 1 + Math.min(d[i-1][j], d[i][j-1], d[i-1][j-1]);
        return d[a.length][b.length];
      }

      function assessTier(text) {
        var t = (text || '').trim();
        var lower = t.toLowerCase();
        var words = lower.split(/\\s+/).filter(Boolean);
        var n = words.length;

        if (n > 60) return 'ultra';

        // Ultra stem matching — catches typos and word variants without exact phrases
        var ULTRA_STEMS = ['implicat', 'architect', 'comprehens', 'tradeoff', 'trade-off', 'strateg', 'evaluat', 'scalab', 'microserv', 'monolith', 'distribut', 'serverless'];
        var ULTRA_FUZZY = ['implications', 'architecture', 'tradeoffs', 'comprehensive', 'evaluate'];
        function isUltraWord(w) {
          if (w.length < 4) return false;
          for (var s = 0; s < ULTRA_STEMS.length; s++) if (w.indexOf(ULTRA_STEMS[s]) !== -1) return true;
          if (w.length >= 7) for (var f = 0; f < ULTRA_FUZZY.length; f++) if (lev(w, ULTRA_FUZZY[f]) <= 2) return true;
          return false;
        }
        if (words.some(isUltraWord)) return 'ultra';

        // "think" + any through-like word nearby
        var hasThink = words.some(function(w) { return lev(w, 'think') <= 1; });
        var hasThrough = words.some(function(w) { return ['through','thru','thro','deeply','carefully','about','over','bout'].indexOf(w) !== -1 || w.indexOf('thro') === 0; });
        if (hasThink && hasThrough && n > 4) return 'ultra';

        // Compare / pros+cons patterns
        var hasCompare = words.some(function(w) { return lev(w, 'compare') <= 1 || w === 'vs' || w === 'versus'; });
        var hasPros = words.some(function(w) { return lev(w, 'pros') <= 1 || lev(w, 'good') <= 1 || w === 'benefit' || w === 'benefits' || w === 'advantage' || w === 'advantages'; });
        var hasCons = words.some(function(w) { return (lev(w, 'cons') <= 1 && w !== 'consider' && w !== 'consistent') || lev(w, 'bad') <= 0 || w === 'downside' || w === 'downsides' || w === 'disadvantage'; });
        if (hasPros && hasCons && n > 4) return 'ultra';
        if (hasCompare && n > 8) return 'ultra';
        if (/\\bdesign\\b/.test(lower) && n > 8) return 'ultra';

        // Pro floor — stem-based so "reviewing", "debuging", "refactored" all catch
        var PRO_STEMS = ['review', 'debug', 'refactor', 'analyz', 'improv', 'structur', 'optim'];
        var hasProStem = PRO_STEMS.some(function(s) { return lower.indexOf(s) !== -1; });
        var hasMyProject = /\\bmy (project|code|app|game|file|codebase|api|service|component|function|class)\\b/.test(lower);
        if (hasProStem || hasMyProject) return 'pro';

        // Flash — needs 2 signals; fuzzy-match question starters to catch "wut","wts","hw do i"
        var Q_WORDS = ['what','how','why','when','where','define','explain','whats','wats','wut','wat'];
        var startsQuestion = words.length > 0 && Q_WORDS.some(function(q) { return lev(words[0], q) <= 1; });
        var flashScore = 0;
        if (n <= 15) flashScore++;
        if (startsQuestion) flashScore++;
        if (/\\b(meaning|syntax|example|difference|simple|quick)\\b/.test(lower)) flashScore++;
        if (!/\\b(my|our|this|the project|the code|the file|the app|the game)\\b/.test(lower)) flashScore += 0.5;
        if (flashScore >= 2) return 'flash';
        return 'pro';
      }

      function activeTier() {
        var inp = document.getElementById('message-input');
        return _tierOverride || assessTier(inp ? inp.value : '');
      }

      function renderBadge() {
        var badge = document.getElementById('tier-badge');
        if (!badge) return;
        var tier = activeTier();
        var cfg = TIER[tier] || TIER.pro;
        var isAdaptive = !_tierOverride;
        var modeColor = isAdaptive ? '#8888aa' : '#f59e0b';
        badge.innerHTML = cfg.icon + ' ' + cfg.label
          + ' <span style="font-size:9px;font-weight:500;opacity:0.8;margin-left:2px;color:' + modeColor + ';">\\u00b7 ' + (isAdaptive ? 'adaptive' : 'manual') + '</span>';
        var borderColor = isAdaptive ? '#4caf50' : '#8b5cf6';
        badge.style.color = cfg.color;
        badge.style.borderColor = borderColor;
        badge.style.background = borderColor + '18';
        badge.title = isAdaptive
          ? 'Adaptive: Redivivus picks the right model as you type (' + cfg.label + ' for this message). Click to set manually.'
          : 'Manual: locked to ' + cfg.label + ' (' + cfg.hint + '). Click to cycle or return to adaptive.';
      }

      // Debounced re-assess on every keystroke
      var _debounce = null;
      var inp = document.getElementById('message-input');
      if (inp) {
        inp.addEventListener('input', function() {
          clearTimeout(_debounce);
          _debounce = setTimeout(function() { if (!_tierOverride) renderBadge(); }, 120);
        });
      }

      // Click cycles: auto -> flash -> pro -> ultra -> auto
      var CYCLE = [null, 'flash', 'pro', 'ultra'];
      document.addEventListener('click', function(e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var badge = t.closest('#tier-badge');
        if (!badge) return;
        var idx = CYCLE.indexOf(_tierOverride);
        _tierOverride = CYCLE[(idx + 1) % CYCLE.length];
        renderBadge();
      });

      // Expose active tier so doSend() can read it
      window._getActiveTier = activeTier;
      window._renderTierBadge = renderBadge;

      // Easter egg: Konami code unlocks personality picker
      // ↑ ↑ ↓ ↓ ← → ← → B A
      var _k = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
      var _ki = 0;
      document.addEventListener('keydown', function(e) {
        if (e.key === _k[_ki]) { _ki++; } else { _ki = e.key === _k[0] ? 1 : 0; }
        if (_ki === _k.length) { _ki = 0; vscode.postMessage({ type: 'easter-egg-personality' }); }
      });

      // Initial render
      renderBadge();
    })();
  `;
}
