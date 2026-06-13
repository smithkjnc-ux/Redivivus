// [SCOPE] Adaptive AI Pill — live prompt-aware provider + tier selector for the chat input bar.
// Replaces the old tier-badge (right side) with a smarter pill on the LEFT side (#adaptive-pill).
// Behaviour:
//   - Blank input  → neutral/faded "⚡ AI" (no provider named, no cost implied)
//   - Typing       → debounced 400ms → assessTier(text) → pick cheapest configured provider
//                    for that tier → pill shows "⚡ Groq · flash", "◆ DeepSeek · pro", etc.
//   - Click pill   → manual-picker popover: all configured providers + "Adaptive (auto)" top row
//   - Manual mode  → pill shows "🔒 Gemini · pro" (purple border) — ONLY that provider used,
//                    no failover to others. Worker tier ≤ supervisor tier enforced on send.
// [WARN] All strings inside this template literal use single-quoted JS. Escape sequences only.
// [WARN] window._getManualProvider() is read by chatPanelScript.ts doSend() — keep it exported.
// [WARN] window._getActiveTier()     is still read by doSend() for backward compat — keep it.

export function buildTierScript(): string {
  return `
    (function() {
      // ── State ───────────────────────────────────────────────────────────────
      var _manualProvider = null; // null = adaptive; {id,label,emoji} = manual lock

      // Ordered provider priority per tier — mirrors backend routingTiers.ts TIER_PRIORITY.
      // [WARN] Keep in sync with routingTiers.ts. Cheapest-capable-first.
      var TIER_PRIORITY = {
        flash: ['groq','openai','claude','gemini','xai','deepseek','kimi'],
        pro:   ['deepseek','gemini','claude','openai','xai','kimi','groq'],
        ultra: ['claude','gemini','openai','deepseek','xai','kimi','groq'],
      };

      // Per-provider display config per tier — what the pill reads to the user.
      var PROVIDER_TIER_LABEL = {
        groq:     { flash: 'Groq',     pro: 'Groq',     ultra: 'Groq'     },
        openai:   { flash: 'GPT Mini', pro: 'GPT-4o',   ultra: 'o3'       },
        claude:   { flash: 'Haiku',    pro: 'Sonnet',   ultra: 'Opus'     },
        gemini:   { flash: 'Flash',    pro: 'Flash',    ultra: 'Gemini Pro'},
        xai:      { flash: 'Grok Mini',pro: 'Grok-3',  ultra: 'Grok-3'   },
        deepseek: { flash: 'DeepSeek', pro: 'DeepSeek', ultra: 'DS Reason'},
        kimi:     { flash: 'Kimi',     pro: 'Kimi',     ultra: 'Kimi'     },
      };

      var TIER_ICON  = { flash: '\\u26A1', pro: '\\u25C6', ultra: '\\u2736' };
      var TIER_COLOR = { flash: '#14B8A6', pro: '#818cf8', ultra: '#f59e0b' };

      // ── Tiny Levenshtein for typo-tolerant tier assessment ──────────────────
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

      // ── Tier assessment (pure client-side, zero tokens) ─────────────────────
      function assessTier(text) {
        var t = (text || '').trim();
        var lower = t.toLowerCase();
        var words = lower.split(/\\s+/).filter(Boolean);
        var n = words.length;
        if (n === 0) return null; // blank input = no tier shown

        if (n > 60) return 'ultra';

        // Ultra: game keywords (always need strong model), architecture words, long comparisons
        if (/\\b(game|chess|tetris|snake|pacman|centipede|puzzle|platformer|shooter|rpg|arcade|pong|breakout|minesweeper|solitaire|2048|wordle|frogger|asteroids|breakout)\\b/.test(lower)) return 'ultra';

        var ULTRA_STEMS = ['implicat','architect','comprehens','tradeoff','strateg','evaluat','scalab','microserv','monolith','distribut'];
        var ULTRA_FUZZY = ['implications','architecture','tradeoffs','comprehensive','evaluate'];
        function isUltraWord(w) {
          if (w.length < 4) return false;
          for (var s = 0; s < ULTRA_STEMS.length; s++) if (w.indexOf(ULTRA_STEMS[s]) !== -1) return true;
          if (w.length >= 7) for (var f = 0; f < ULTRA_FUZZY.length; f++) if (lev(w, ULTRA_FUZZY[f]) <= 2) return true;
          return false;
        }
        if (words.some(isUltraWord)) return 'ultra';

        var hasThink   = words.some(function(w) { return lev(w, 'think') <= 1; });
        var hasThrough = words.some(function(w) { return ['through','thru','deeply','carefully','bout','over'].indexOf(w) !== -1; });
        if (hasThink && hasThrough && n > 4) return 'ultra';

        var hasCompare = words.some(function(w) { return lev(w,'compare')<=1 || w==='vs' || w==='versus'; });
        var hasPros    = words.some(function(w) { return lev(w,'pros')<=1 || w==='benefits' || w==='advantage'; });
        var hasCons    = words.some(function(w) { return (lev(w,'cons')<=1 && w!=='consider') || w==='downside'; });
        if (hasPros && hasCons && n > 4) return 'ultra';
        if (hasCompare && n > 8) return 'ultra';
        if (/\\bdesign\\b/.test(lower) && n > 8) return 'ultra';

        // Build / fix / code — pro tier (but NOT if it's just a question about the project)
        // Imperative build verbs = always at least pro
        if (/\\b(build|make|create|generate|write|add|implement|code)\\b/.test(lower) && n > 3) return 'pro';
        if (/\\b(fix|debug|repair|refactor|update|change|improve|edit|modify)\\b/.test(lower)) return 'pro';

        var PRO_STEMS = ['review','debug','refactor','analyz','improv','structur','optim'];
        if (PRO_STEMS.some(function(s) { return lower.indexOf(s) !== -1; })) return 'pro';
        if (/\\bmy (project|code|app|game|file|codebase|api|service|component|class)\\b/.test(lower)) return 'pro';

        // Flash: simple question (needs 2 signals)
        var Q_WORDS = ['what','how','why','when','where','define','explain','whats','wut','wat','who','is','can'];
        var startsQ = words.length > 0 && Q_WORDS.some(function(q) { return lev(words[0], q) <= 1; });
        var flashScore = 0;
        if (n <= 15) flashScore++;
        if (startsQ)  flashScore++;
        if (/\\b(meaning|syntax|example|difference|simple|quick|time|date|hello|hi)\\b/.test(lower)) flashScore++;
        if (!/\\b(my|our|this|the project|the code|the file|the app|the game)\\b/.test(lower)) flashScore += 0.5;
        if (flashScore >= 2) return 'flash';

        return 'pro'; // safe default
      }

      // ── Provider resolution ─────────────────────────────────────────────────
      // Returns the cheapest available provider for a tier from the pill's data-providers list.
      function pickProvider(tier) {
        var pill = document.getElementById('adaptive-pill');
        if (!pill) return null;
        var raw = pill.getAttribute('data-providers') || '[]';
        var configured;
        try { configured = JSON.parse(raw.replace(/&quot;/g, '"')); } catch { configured = []; }
        if (!configured.length) return null;
        var order = TIER_PRIORITY[tier] || TIER_PRIORITY.pro;
        var configuredIds = configured.map(function(p) { return p.id; });
        // Walk priority list — first match wins (cheapest-capable)
        for (var i = 0; i < order.length; i++) {
          if (configuredIds.indexOf(order[i]) !== -1) {
            var found = configured.find(function(p) { return p.id === order[i]; });
            return found || null;
          }
        }
        return configured[0] || null; // fallback: any configured provider
      }

      // ── Pill render ─────────────────────────────────────────────────────────
      function renderPill() {
        var pill = document.getElementById('adaptive-pill');
        if (!pill) return;
        var inp = document.getElementById('message-input');
        var text = (inp && inp.value) ? inp.value : '';

        if (_manualProvider) {
          // MANUAL MODE — locked to a specific provider
          // Show provider name + tier for the current prompt (so user knows which model they're getting)
          var lockedTier = assessTier(text) || 'pro';
          // For manual mode: builds always get at least pro (never flash for code generation supervisor)
          var isCodeWork = lockedTier === 'ultra' || lockedTier === 'pro';
          var displayTier = isCodeWork ? lockedTier : lockedTier;
          var modelLabel = (PROVIDER_TIER_LABEL[_manualProvider.id] || {})[displayTier] || _manualProvider.label;
          pill.innerHTML = '\\uD83D\\uDD12 ' + modelLabel + ' <span style="font-size:9px;opacity:0.75;margin-left:2px;">&middot; manual</span>';
          pill.style.color = '#a78bfa';
          pill.style.borderColor = '#7c3aed';
          pill.style.background = '#7c3aed22';
          pill.title = 'Manual: locked to ' + _manualProvider.label + '. Click to switch provider or return to Adaptive.';
          return;
        }

        // ADAPTIVE MODE
        var tier = assessTier(text);
        if (!tier) {
          // Blank input — neutral placeholder, no provider committed
          pill.innerHTML = '\\u26A1 AI';
          pill.style.color = '#555';
          pill.style.borderColor = '#3d3d3d';
          pill.style.background = 'transparent';
          pill.title = 'Adaptive: picks the right AI as you type. Click to lock a specific provider.';
          return;
        }

        var provider = pickProvider(tier);
        var icon  = TIER_ICON[tier]  || '\\u25C6';
        var color = TIER_COLOR[tier] || '#818cf8';
        var provLabel = provider ? ((PROVIDER_TIER_LABEL[provider.id] || {})[tier] || provider.label) : tier;
        pill.innerHTML = icon + ' ' + provLabel + ' <span style="font-size:9px;opacity:0.7;margin-left:2px;">&middot; ' + tier + '</span>';
        pill.style.color = color;
        pill.style.borderColor = '#4caf5066'; // green tint = adaptive
        pill.style.background = color + '18';
        pill.title = 'Adaptive: ' + (provider ? provider.label : '') + ' (' + tier + ') for this message. Click to lock a provider.';
      }

      // ── Debounced input listener ────────────────────────────────────────────
      var _debounce = null;
      var inp = document.getElementById('message-input');
      if (inp) {
        inp.addEventListener('input', function() {
          if (_manualProvider) return; // manual lock — no re-assessment needed
          clearTimeout(_debounce);
          _debounce = setTimeout(renderPill, 400);
        });
      }

      // ── Manual-picker popover ───────────────────────────────────────────────
      function showManualPicker() {
        var existing = document.getElementById('adaptive-picker');
        if (existing) { existing.remove(); return; } // toggle

        var pill = document.getElementById('adaptive-pill');
        var raw = (pill && pill.getAttribute('data-providers')) || '[]';
        var configured;
        try { configured = JSON.parse(raw.replace(/&quot;/g, '"')); } catch { configured = []; }

        var pop = document.createElement('div');
        pop.id = 'adaptive-picker';
        pop.style.cssText = 'position:fixed;bottom:72px;left:12px;background:#1e1e2e;border:1px solid #3d3d5c;border-radius:10px;padding:8px 6px;box-shadow:0 8px 32px rgba(0,0,0,0.5);z-index:9999;font-family:inherit;min-width:190px;';

        // Header row
        var hdr = document.createElement('div');
        hdr.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:0.08em;color:#666;padding:2px 8px 6px;';
        hdr.textContent = 'PICK AI PROVIDER';
        pop.appendChild(hdr);

        // "Adaptive (auto)" row — always first
        var autoRow = document.createElement('button');
        autoRow.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;border:none;border-radius:7px;background:' + (_manualProvider ? 'transparent' : '#4caf5020') + ';cursor:pointer;font-size:12px;color:' + (_manualProvider ? '#aaa' : '#4caf50') + ';font-family:inherit;text-align:left;';
        autoRow.innerHTML = '\\u26A1 <span style="flex:1;">Adaptive <span style="font-size:10px;opacity:0.6;">(auto)</span></span>' + (!_manualProvider ? ' \\u2713' : '');
        autoRow.addEventListener('click', function() {
          _manualProvider = null;
          pop.remove();
          renderPill();
        });
        pop.appendChild(autoRow);

        // Divider
        var sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:#2d2d4e;margin:4px 6px;';
        pop.appendChild(sep);

        // One row per configured provider
        configured.forEach(function(p) {
          var isActive = _manualProvider && _manualProvider.id === p.id;
          var row = document.createElement('button');
          row.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;border:none;border-radius:7px;background:' + (isActive ? '#7c3aed22' : 'transparent') + ';cursor:pointer;font-size:12px;color:' + (isActive ? '#a78bfa' : '#ccc') + ';font-family:inherit;text-align:left;transition:background 0.1s;';
          row.addEventListener('mouseover', function() { if (!isActive) row.style.background = '#ffffff0a'; });
          row.addEventListener('mouseout',  function() { if (!isActive) row.style.background = 'transparent'; });
          // Show the pro-tier model name as the "headline" (most common for builds)
          var proLabel = (PROVIDER_TIER_LABEL[p.id] || {}).pro || p.label;
          row.innerHTML = p.emoji + ' <span style="flex:1;">' + p.label + ' <span style="font-size:10px;opacity:0.55;">' + proLabel + '</span></span>' + (isActive ? ' \\uD83D\\uDD12' : '');
          row.addEventListener('click', function() {
            _manualProvider = { id: p.id, label: p.label, emoji: p.emoji };
            pop.remove();
            renderPill();
          });
          pop.appendChild(row);
        });

        // Hint line
        var hint = document.createElement('div');
        hint.style.cssText = 'font-size:10px;color:#555;padding:6px 10px 2px;';
        hint.textContent = 'Manual = only this AI, no failover.';
        pop.appendChild(hint);

        document.body.appendChild(pop);

        // Close on outside click
        setTimeout(function() {
          document.addEventListener('click', function closePop(e) {
            if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', closePop); }
          });
        }, 50);
      }

      // ── Pill click handler ──────────────────────────────────────────────────
      document.addEventListener('click', function(e) {
        var t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('#adaptive-pill')) { showManualPicker(); }
      });

      // ── Public API (read by chatPanelScript.ts doSend) ─────────────────────
      // Returns the manual provider id string, or null for adaptive.
      window._getManualProvider = function() {
        return _manualProvider ? _manualProvider.id : null;
      };

      // Returns the assessed tier for the current input (backward compat with doSend tier param).
      window._getActiveTier = function() {
        if (_manualProvider) {
          // In manual mode: assess tier normally — the PROVIDER is locked, not the tier.
          var inp2 = document.getElementById('message-input');
          return assessTier((inp2 && inp2.value) ? inp2.value : '') || 'pro';
        }
        var inp3 = document.getElementById('message-input');
        return assessTier((inp3 && inp3.value) ? inp3.value : '') || 'pro';
      };

      // Easter egg: Konami code
      var _k = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
      var _ki = 0;
      document.addEventListener('keydown', function(e) {
        if (e.key === _k[_ki]) { _ki++; } else { _ki = e.key === _k[0] ? 1 : 0; }
        if (_ki === _k.length) { _ki = 0; vscode.postMessage({ type: 'easter-egg-personality' }); }
      });

      // Initial render (neutral — no provider named until user types)
      renderPill();
    })();
  `;
}
