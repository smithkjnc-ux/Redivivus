// [SCOPE] Adaptive pill render and manual-picker popover — extracted from chatPanelScriptTier.ts (Rule 9 split).

export function buildTierPickerScript(): string {
  return `
      // ── Pill render ─────────────────────────────────────────────────────────
      var GREEN = '#4caf50';
      var PURPLE = '#a78bfa';
      var PURPLE_DARK = '#7c3aed';
      function renderPill() {
        var pill = document.getElementById('adaptive-pill');
        if (!pill) return;
        var inp = document.getElementById('message-input');
        var text = (inp && inp.value) ? inp.value : '';

        if (window._hasRoutingOverride && window._hasRoutingOverride()) {
          pill.innerHTML =
            '<span style="font-size:10px;font-weight:700;letter-spacing:0.04em;">Manual</span>' +
            '<span style="opacity:0.45;margin:0 5px;">\u00B7</span>' +
            'routing override';
          pill.style.color = PURPLE;
          pill.style.borderColor = PURPLE_DARK;
          pill.style.background = PURPLE_DARK + '22';
          pill.title = 'Manual: Supervisor/Worker/Guardian overridden in Routing panel. Click Adaptive pill to reset, or open Routing to adjust.';
          return;
        }

        if (_manualProvider) {
          var lockedTier = currentTier() || 'pro';
          var modelLabel = _manualProvider.modelLabel || (PROVIDER_TIER_LABEL[_manualProvider.id] || {})[lockedTier] || _manualProvider.label;
          pill.innerHTML =
            '<span style="font-size:10px;font-weight:700;letter-spacing:0.04em;">Manual</span>' +
            '<span style="opacity:0.45;margin:0 5px;">\u00B7</span>' +
            (_manualProvider.emoji ? _manualProvider.emoji + '\u202F' : '') + modelLabel;
          pill.style.color = PURPLE;
          pill.style.borderColor = PURPLE_DARK;
          pill.style.background = PURPLE_DARK + '22';
          pill.title = 'Manual: locked to ' + _manualProvider.label + ' \u2014 no failover. Click to change or return to Adaptive.';
          return;
        }

        if (!text.trim()) {
          pill.innerHTML = '<span style="font-size:10px;font-weight:700;letter-spacing:0.04em;">Adaptive</span>';
          pill.style.color = GREEN;
          pill.style.borderColor = GREEN + '55';
          pill.style.background = GREEN + '0e';
          pill.title = 'Adaptive: the AI sizes each request as you type. Click to lock a specific provider.';
          return;
        }

        var tier = currentTier();
        if (!tier) {
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

        var provider = pickProvider(tier);
        var provLabel = provider ? ((PROVIDER_TIER_LABEL[provider.id] || {})[tier] || provider.label) : tier;
        var provEmoji = provider ? (provider.emoji ? provider.emoji + '\u202F' : '') : '';
        pill.innerHTML =
          '<span style="font-size:10px;font-weight:700;letter-spacing:0.04em;">Adaptive</span>' +
          '<span style="opacity:0.35;margin:0 5px;">\u00B7</span>' +
          provEmoji + provLabel;
        pill.style.color = GREEN;
        pill.style.borderColor = GREEN + '77';
        pill.style.background = GREEN + '18';
        pill.title = 'Adaptive: ' + (provider ? provider.label : '') + ' (' + tier + ') for this message. Click to lock a provider.';
      }

      // ── Manual-picker popover ───────────────────────────────────────────────
      function showManualPicker() {
        var existing = document.getElementById('adaptive-picker');
        if (existing) { existing.remove(); return; }

        var pill = document.getElementById('adaptive-pill');
        var raw = (pill && pill.getAttribute('data-providers')) || '[]';
        var configured;
        try { configured = JSON.parse(raw.replace(/&quot;/g, '"')); } catch { configured = []; }

        var pop = document.createElement('div');
        pop.id = 'adaptive-picker';
        pop.style.cssText = 'position:fixed;bottom:72px;left:12px;background:#1e1e2e;border:1px solid #3d3d5c;border-radius:10px;padding:8px 6px;box-shadow:0 8px 32px rgba(0,0,0,0.5);z-index:9999;font-family:inherit;min-width:190px;';

        var hdr = document.createElement('div');
        hdr.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:0.08em;color:#666;padding:2px 8px 6px;';
        hdr.textContent = 'PICK AI PROVIDER';
        pop.appendChild(hdr);

        var autoRow = document.createElement('button');
        autoRow.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;border:none;border-radius:7px;background:' + (_manualProvider ? 'transparent' : '#4caf5020') + ';cursor:pointer;font-size:12px;color:' + (_manualProvider ? '#aaa' : '#4caf50') + ';font-family:inherit;text-align:left;';
        autoRow.innerHTML = '\\u26A1 <span style="flex:1;">Adaptive <span style="font-size:10px;opacity:0.6;">(auto)</span></span>' + (!_manualProvider ? ' \\u2713' : '');
        autoRow.addEventListener('click', function() { _manualProvider = null; pop.remove(); renderPill(); });
        pop.appendChild(autoRow);

        var sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:#2d2d4e;margin:4px 6px;';
        pop.appendChild(sep);

        configured.forEach(function(p) {
          var phdr = document.createElement('div');
          phdr.style.cssText = 'display:flex;align-items:center;gap:6px;padding:7px 10px 2px;font-size:11px;font-weight:700;color:#8888aa;';
          phdr.innerHTML = (p.emoji || '') + ' ' + p.label;
          pop.appendChild(phdr);
          var models = (p.models && p.models.length) ? p.models : [{ id: p.id, label: (PROVIDER_TIER_LABEL[p.id] || {}).pro || p.label, cap: 0 }];
          models.forEach(function(m) {
            var isActive = _manualProvider && _manualProvider.id === p.id && _manualProvider.model === m.id;
            var row = document.createElement('button');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:5px 10px 5px 24px;border:none;border-radius:7px;background:' + (isActive ? '#7c3aed22' : 'transparent') + ';cursor:pointer;font-size:12px;color:' + (isActive ? '#a78bfa' : '#ccc') + ';font-family:inherit;text-align:left;transition:background 0.1s;';
            row.addEventListener('mouseover', function() { if (!isActive) row.style.background = '#ffffff0a'; });
            row.addEventListener('mouseout',  function() { if (!isActive) row.style.background = 'transparent'; });
            row.innerHTML = '<span style="flex:1;">' + m.label + (m.cap ? ' <span style="font-size:10px;opacity:0.4;">cap ' + m.cap + '</span>' : '') + '</span>' + (isActive ? ' \\uD83D\\uDD12' : '');
            row.addEventListener('click', function() {
              _manualProvider = { id: p.id, label: p.label, emoji: p.emoji, model: m.id, modelLabel: m.label };
              pop.remove();
              renderPill();
            });
            pop.appendChild(row);
          });
        });

        var hint = document.createElement('div');
        hint.style.cssText = 'font-size:10px;color:#555;padding:6px 10px 2px;';
        hint.textContent = 'Manual = only this exact model, no failover.';
        pop.appendChild(hint);

        document.body.appendChild(pop);
        setTimeout(function() {
          document.addEventListener('click', function closePop(e) {
            if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', closePop); }
          });
        }, 50);
      }
  `;
}
