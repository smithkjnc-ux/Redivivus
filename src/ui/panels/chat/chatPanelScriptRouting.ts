// [SCOPE] Chat routing panel — an expandable "who handles this request" breakdown under the input. Shows the
// suggested Supervisor / Worker / Guardian (model + reason, from the client tier heuristic) and lets the user
// override each role's AI. Progressive disclosure: collapsed by default (auto), expand to see/override. Overrides
// are read by doSend (window._getRoutingOverrides) and honored client-side in the fix pipeline. ASCII-only (Rule 13).
export function buildRoutingScript(): string {
  return `
    (function(){
      var input = document.getElementById('message-input');
      var card = document.getElementById('input-card');
      if (!input || !card) { return; }

      var ov = { supervisor:'', worker:'', guardian:'' }; // provider id per role; '' = auto
      var open = false;
      window._getRoutingOverrides = function(){
        var o = {};
        if(ov.supervisor){o.supervisor=ov.supervisor;} if(ov.worker){o.worker=ov.worker;} if(ov.guardian){o.guardian=ov.guardian;}
        return Object.keys(o).length ? o : undefined;
      };
      // [FIX] Expose a simple boolean so the adaptive pill knows to show 'Manual' when any routing
      // override is active. The pill calls this in renderPill() -- no state duplication needed.
      window._hasRoutingOverride = function(){
        return !!(ov.supervisor || ov.worker || ov.guardian);
      };

      // Panel lives in #input-card (survives header refresh). Created once.
      var panel = document.getElementById('routing-panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id='routing-panel';
        panel.style.cssText='display:none;padding:8px 14px 4px;border-top:1px solid var(--c-border);';
        card.insertBefore(panel, document.getElementById('input-bottom'));
      }

      var REASON = { ultra:'complex / architectural -- strongest reasoning', pro:'standard coding task -- balanced', flash:'simple / quick -- fast and cheap' };
      var ROLES = [
        { key:'supervisor', label:'Supervisor', sub:'diagnoses & plans' },
        { key:'worker',     label:'Worker',     sub:'writes the code' },
        { key:'guardian',   label:'Guardian',   sub:'reviews the result' }
      ];

      function render(){
        var base = (window._assessTier ? window._assessTier(input.value || '') : 'pro');
        var provs = (window._getProviders ? window._getProviders() : []);
        var lbl = function(p,t){ return (window._tierModelLabel ? window._tierModelLabel(p,t) : t); };
        var rows = ROLES.map(function(r){
          var tier = base; // supervisor=task complexity; worker effort tracks it (Supervisor may adjust); guardian reviews at that level
          var auto = (window._pickProviderForTier ? window._pickProviderForTier(tier) : null);
          var opts = '<option value="">Auto (' + (auto ? lbl(auto,tier) : tier) + ')</option>' +
            provs.map(function(p){ return '<option value="'+p.id+'"'+(ov[r.key]===p.id?' selected':'')+'>'+(p.emoji?p.emoji+' ':'')+lbl(p.id,tier)+'</option>'; }).join('');
          return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'+
            '<div style="width:80px;"><b style="font-size:12px;">'+r.label+'</b><div style="opacity:.5;font-size:10px;">'+r.sub+'</div></div>'+
            '<select data-role="'+r.key+'" style="max-width:160px;background:var(--c-raised);color:var(--c-text);border:1px solid var(--c-border);border-radius:6px;padding:3px 6px;font-size:11px;">'+opts+'</select>'+
            '<div style="flex:1;opacity:.6;font-size:10px;">'+(ov[r.key]?'manual override':REASON[tier])+'</div></div>';
        }).join('');
        panel.innerHTML = '<div style="opacity:.55;margin-bottom:7px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Who handles this request</div>'+rows+
          '<div style="opacity:.45;font-size:10px;margin:2px 0 4px;">Auto = right-sized for you. Override any role for higher-quality or cheaper results.</div>';
        var sels = panel.querySelectorAll('select');
        for(var i=0;i<sels.length;i++){ (function(s){ s.onchange=function(){
          ov[s.getAttribute('data-role')]=s.value;
          render();
          // [FIX] Sync the adaptive pill so it shows 'Manual' when any override is active.
          if (window._renderAdaptivePill) { window._renderAdaptivePill(); }
        }; })(sels[i]); }
      }

      // Toggle lives in #input-left, which is REPLACED on every header refresh -> recreate it idempotently
      // (mirrors window._renderAdaptivePill). The listener calls window._ensureRoutingToggle() after update-header.
      function ensureToggle(){
        if (document.getElementById('routing-toggle')) { return; }
        var left = document.getElementById('input-left'); if (!left) { return; }
        var tog = document.createElement('button');
        tog.id='routing-toggle'; tog.type='button'; tog.title='See or choose the AIs that handle this request';
        tog.innerHTML='Routing '+(open?'&#9652;':'&#9662;');
        tog.style.cssText='background:transparent;border:1px solid var(--c-border);color:var(--c-text-dim);border-radius:20px;font-size:11px;padding:4px 9px;cursor:pointer;margin-left:4px;';
        tog.onclick=function(){ open=!open; panel.style.display=open?'block':'none'; tog.innerHTML='Routing '+(open?'&#9652;':'&#9662;'); if(open){ render(); } };
        left.appendChild(tog);
      }
      window._ensureRoutingToggle = ensureToggle;
      ensureToggle();

      var t; input.addEventListener('input', function(){ if(!open){ return; } clearTimeout(t); t=setTimeout(render, 350); });
    })();
  `;
}
