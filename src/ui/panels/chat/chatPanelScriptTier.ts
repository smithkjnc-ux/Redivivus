// [SCOPE] Adaptive AI Pill — live prompt-aware provider + tier selector for the chat input bar.
// Replaces the old tier-badge (right side) with a smarter pill on the LEFT side (#adaptive-pill).
// Behaviour:
//   - Blank input  → neutral/faded "⚡ AI" (no provider named, no cost implied)
//   - Typing       → debounced 400ms → AI classifier (extension) sizes the tier → pick cheapest configured
//                    provider for that tier → pill shows "⚡ Groq · flash", "◆ DeepSeek · pro", etc.
//                    Shows "Adaptive · sizing…" until the classifier responds. No regex/keyword matching (Rule 18).
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

      // ── AI tier (Rule 18: understanding, not regex) ─────────────────────────
      // The tier is decided by the backend AI classifier, NEVER keyword/regex matching. We cache the last result
      // for the current input text and show 'sizing...' until it returns. The binding decision is re-confirmed
      // server-side at fix time, so a momentary stale/blank pill is harmless. The old keyword assessTier() and its
      // Levenshtein helper were removed -- they mis-sized requests with no fix/build verb (Rule 18 violation).
      // State lives on window (not IIFE-local) so the once-registered message listener and any closures created
      // by a panel HTML rebuild all share the same cache — no stale-closure drift.
      if (window._rtTier === undefined) { window._rtTier = null; window._rtText = ''; }

      // Tier for the CURRENT input, or null if not yet classified.
      function currentTier() {
        var el0 = document.getElementById('message-input');
        var text = (el0 && el0.value ? el0.value : '').trim();
        if (!text) return null;
        return text === window._rtText ? window._rtTier : null;
      }

      // Ask the extension to AI-classify the current input. Skips too-short or already-known text.
      function requestClassify() {
        var el0 = document.getElementById('message-input');
        var text = (el0 && el0.value ? el0.value : '').trim();
        if (text.length < 3) { window._rtTier = null; window._rtText = ''; renderPill(); return; }
        if (text === window._rtText) { renderPill(); return; }
        renderPill();
        vscode.postMessage({ type: 'classify-route', text: text });
      }

      // Receive the classifier result. Ignore if the input changed since the request (stale). Registered once
      // (idempotent) so a panel HTML rebuild that re-runs this IIFE does not stack duplicate listeners.
      if (!window._routeTierListener) {
        window._routeTierListener = true;
        window.addEventListener('message', function(ev) {
          var m = ev.data;
          if (!m || m.type !== 'route-tier') return;
          var el0 = document.getElementById('message-input');
          var cur = (el0 && el0.value ? el0.value : '').trim();
          if ((m.text || '') !== cur) return;
          window._rtTier = (m.tier === 'flash' || m.tier === 'pro' || m.tier === 'ultra') ? m.tier : 'pro';
          window._rtText = cur;
          if (window._renderAdaptivePill) { window._renderAdaptivePill(); }
        });
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
      // GREEN = adaptive mode (any tier). PURPLE = manual lock. Simple rule, always consistent.
      var GREEN = '#4caf50';
      var PURPLE = '#a78bfa';
      var PURPLE_DARK = '#7c3aed';
      function renderPill() {
        var pill = document.getElementById('adaptive-pill');
        if (!pill) return;
        var inp = document.getElementById('message-input');
        var text = (inp && inp.value) ? inp.value : '';

        if (_manualProvider) {
          // MANUAL MODE — purple. Format: "Manual · [AI Name]"
          var lockedTier = currentTier() || 'pro';
          var modelLabel = (PROVIDER_TIER_LABEL[_manualProvider.id] || {})[lockedTier] || _manualProvider.label;
          pill.innerHTML =
            '<span style="font-size:10px;font-weight:700;letter-spacing:0.04em;">' + 'Manual' + '</span>' +
            '<span style="opacity:0.45;margin:0 5px;">\u00B7</span>' +
            (_manualProvider.emoji ? _manualProvider.emoji + '\u202F' : '') + modelLabel;
          pill.style.color = PURPLE;
          pill.style.borderColor = PURPLE_DARK;
          pill.style.background = PURPLE_DARK + '22';
          pill.title = 'Manual: locked to ' + _manualProvider.label + ' \u2014 no failover. Click to change or return to Adaptive.';
          return;
        }

        // ADAPTIVE MODE — always green border
        if (!text.trim()) {
          // Blank input — green but dimmed
          pill.innerHTML = '<span style="font-size:10px;font-weight:700;letter-spacing:0.04em;">Adaptive</span>';
          pill.style.color = GREEN;
          pill.style.borderColor = GREEN + '55';
          pill.style.background = GREEN + '0e';
          pill.title = 'Adaptive: the AI sizes each request as you type. Click to lock a specific provider.';
          return;
        }

        var tier = currentTier();
        if (!tier) {
          // AI is still sizing this request — neutral 'sizing' state, never a keyword guess.
          pill.innerHTML =
            '<span style="font-size:10px;font-weight:700;letter-spacing:0.04em;">Adaptive</span>' +
            '<span style="opacity:0.35;margin:0 5px;">\\u00B7</span>' +
            '<span style="opacity:0.6;">sizing\\u2026</span>';
          pill.style.color = GREEN;
          pill.style.borderColor = GREEN + '55';
          pill.style.background = GREEN + '0e';
          pill.title = 'Adaptive: the AI is reading your request to pick the right model.';
          return;
        }

        // Sized — green label + provider name. "Adaptive · Groq"
        var provider = pickProvider(tier);
        var provLabel = provider ? ((PROVIDER_TIER_LABEL[provider.id] || {})[tier] || provider.label) : tier;
        var provEmoji = provider ? (provider.emoji ? provider.emoji + '\u202F' : '') : '';
        pill.innerHTML =
          '<span style="font-size:10px;font-weight:700;letter-spacing:0.04em;">' + 'Adaptive' + '</span>' +
          '<span style="opacity:0.35;margin:0 5px;">\u00B7</span>' +
          provEmoji + provLabel;
        pill.style.color = GREEN;
        pill.style.borderColor = GREEN + '77';
        pill.style.background = GREEN + '18';
        pill.title = 'Adaptive: ' + (provider ? provider.label : '') + ' (' + tier + ') for this message. Click to lock a provider.';
      }

      // ── Debounced input listener ────────────────────────────────────────────
      var _debounce = null;
      var inp = document.getElementById('message-input');
      if (inp) {
        inp.addEventListener('input', function() {
          // Classify in BOTH modes — manual locks the PROVIDER, but the tier still labels the model.
          clearTimeout(_debounce);
          _debounce = setTimeout(requestClassify, 400);
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

      // [FIX] Called by chatPanelScriptListener.ts after update-header replaces #input-left innerHTML,
      // so the manual lock state is visually reflected in the fresh pill element.
      window._renderAdaptivePill = function() { renderPill(); };

      // Returns the AI-assessed tier for the current input (read by doSend; server re-confirms at fix time).
      window._getActiveTier = function() { return currentTier() || 'pro'; };

      // ── Routing-panel primitives (read by chatPanelScriptRouting.ts) ─────────
      // AI-cached tier for the current input. Returns 'pro' until the classifier responds (no keyword guess).
      window._assessTier = function() { return currentTier() || 'pro'; };
      window._tierModelLabel = function(provId, tier) { return (PROVIDER_TIER_LABEL[provId] || {})[tier] || provId; };
      window._pickProviderForTier = function(tier) { var p = pickProvider(tier); return p ? p.id : null; };
      window._getProviders = function() {
        try { var el = document.getElementById('adaptive-pill'); return el ? JSON.parse(el.getAttribute('data-providers') || '[]') : []; }
        catch (e) { return []; }
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
