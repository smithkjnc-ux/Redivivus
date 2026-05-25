// [SCOPE] CSS styles for the Redivivus Architecture Map webview panel
/* [WARN] All selectors are scoped to this panel — no global leakage */

export const MAP_STYLES = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #1e1e2e; color: #cdd6f4; font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

#header { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; background: #181825; border-bottom: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; gap: 12px; }
#map-title { font-size: 13px; font-weight: 600; color: #cba6f7; }
#legend { display: flex; gap: 14px; font-size: 11px; color: #a6adc8; align-items: center; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
.dot.good  { background: #4ec959; }
.dot.warn  { background: #f0a500; }
.dot.bad   { background: #e05555; }
#refresh-btn { margin-left: auto; background: #313244; border: none; border-radius: 6px; color: #cdd6f4; padding: 5px 10px; font-size: 11px; cursor: pointer; }
#refresh-btn:hover { background: #45475a; }

#layout-toggles { display: flex; background: #1e1e2e; padding: 3px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); margin-left: auto; margin-right: 20px; }
.layout-btn { background: transparent; border: none; color: #a6adc8; padding: 6px 12px; font-size: 11px; font-weight: 600; border-radius: 5px; cursor: pointer; transition: all 0.2s; }
.layout-btn:hover { color: #cdd6f4; background: rgba(255,255,255,0.05); }
.layout-btn.active { background: #313244; color: #cba6f7; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }

#root { flex: 1; display: flex; position: relative; overflow: hidden; }
#canvas { flex: 1; display: block; cursor: grab; min-width: 0; }
#canvas:active { cursor: grabbing; }
#side-panel { width: 280px; min-width: 280px; background: #181825; border-left: 1px solid rgba(255,255,255,0.08); padding: 0; overflow: hidden; flex-shrink: 0; position: relative; display: flex; flex-direction: column; z-index: 10; }
#side-panel-scroll { flex: 1; overflow-y: auto; padding: 14px 14px 0; display: flex; flex-direction: column; gap: 10px; }
#side-panel.hidden { display: none !important; }
.side-close { align-self: flex-end; cursor: pointer; color: #a6adc8; font-size: 18px; line-height: 1; padding: 2px 6px; border-radius: 4px; }
.side-close:hover { color: #cdd6f4; }
.side-health { font-size: 20px; }
.side-filename { font-size: 14px; font-weight: 700; color: #cba6f7; margin-top: 2px; }
.side-path { font-size: 10px; color: #6c7086; word-break: break-all; }
.side-desc { font-size: 12px; color: #a6adc8; line-height: 1.6; border-left: 2px solid #313244; padding-left: 10px; }
.side-stats { display: flex; gap: 8px; flex-wrap: wrap; }
.stat-chip { font-size: 11px; padding: 2px 8px; border-radius: 12px; background: #313244; color: #a6adc8; }
.stat-chip.warn { background: rgba(240,165,0,0.15); color: #f0a500; }
.stat-chip.bad  { background: rgba(224,85,85,0.15); color: #e05555; }
.side-actions { display: flex; flex-direction: column; gap: 0; padding: 10px 12px 14px; border-top: 1px solid rgba(255,255,255,0.06); background: #181825; flex-shrink: 0; }
.action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.ag-btn { background: #313244; border: 1px solid rgba(255,255,255,0.07); border-radius: 7px; color: #cdd6f4; padding: 8px 10px; font-size: 11px; cursor: pointer; text-align: center; transition: background 0.15s, border-color 0.15s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ag-btn:hover { background: #45475a; border-color: rgba(255,255,255,0.18); }
.ag-btn.primary { background: #4a9eff; color: #0f0f1a; font-weight: 700; border-color: transparent; }
.ag-btn.primary:hover { background: #6ab4ff; }
.ag-btn.warn { background: rgba(224,85,85,0.15); border-color: rgba(224,85,85,0.35); color: #e05555; }
.ag-btn.warn:hover { background: rgba(224,85,85,0.28); }
.btn-open { background: #cba6f7 !important; color: #1e1e2e !important; font-weight: bold !important; }
.btn-open:hover { background: #b08ee0 !important; }
.side-flow { font-style: italic; border-left: 2px solid #cba6f7; padding-left: 8px; margin-top: 4px; }
.side-health { font-size: 28px; }
.btn-fix { background: rgba(224,85,85,0.15) !important; border-color: rgba(224,85,85,0.3) !important; color: #e05555 !important; }
.btn-fix:hover { background: rgba(224,85,85,0.28) !important; }
.btn-chat { background: rgba(203,166,247,0.1) !important; border-color: rgba(203,166,247,0.25) !important; color: #cba6f7 !important; }
.btn-chat:hover { background: rgba(203,166,247,0.2) !important; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px; color: #6c7086; font-size: 13px; text-align: center; padding: 32px; }
#toast { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: #313244; color: #cdd6f4; padding: 8px 18px; border-radius: 8px; font-size: 12px; display: none; z-index: 999; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
.conn-list { margin-top: 10px; font-size: 11px; color: #a6adc8; background: rgba(0,0,0,0.15); padding: 10px; border-radius: 6px; }
.conn-list strong { color: #cdd6f4; font-weight: 600; display: block; margin-bottom: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
.conn-list .conn-group { margin-bottom: 10px; }
.conn-list .conn-group:last-child { margin-bottom: 0; }
.conn-item { display: inline-block; background: #313244; padding: 3px 6px; border-radius: 4px; margin: 0 4px 4px 0; font-size: 10px; }
.eli5-box { background: rgba(78,201,89,0.1); border: 1px solid rgba(78,201,89,0.3); border-radius: 8px; padding: 12px; margin-top: 10px; font-size: 12px; color: #cdd6f4; line-height: 1.5; }
.eli5-box strong { color: #4ec959; display: block; margin-bottom: 4px; }
.eli5-loading { font-size: 11px; color: #a6adc8; font-style: italic; margin-top: 10px; padding: 10px; text-align: center; }
#lens-preview { position: fixed; width: 180px; background: #181825; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 12px; font-size: 12px; z-index: 1000; box-shadow: 0 10px 30px rgba(0,0,0,0.5); pointer-events: none; }
.lens-thumb { width: 100%; height: 80px; background: rgba(0,0,0,0.3); border: solid 1px rgba(255,255,255,0.05); border-radius: 6px; margin-top: 8px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #585b70; text-transform: uppercase; }
.critique-box { background: rgba(224,85,85,0.08); border: 1px solid rgba(224,85,85,0.2); border-radius: 8px; padding: 10px; margin-top: 10px; font-size: 12px; line-height: 1.4; color: #cdd6f4; }
.critique-box.warn { background: rgba(245,166,35,0.08); border-color: rgba(245,166,35,0.2); }
.critique-box strong { display: block; margin-bottom: 3px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
.critique-box.bad strong { color: #e05555; }
.critique-box.warn strong { color: #f5a623; }
.roadmap-box { background: rgba(203,166,247,0.05); border: 1px solid rgba(203,166,247,0.15); border-radius: 8px; padding: 12px; margin-top: 10px; font-size: 12px; }
.roadmap-box strong { color: #cba6f7; display: block; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; }
.roadmap-box ul { padding-left: 18px; margin: 0; color: #a6adc8; }
.roadmap-box li { margin-bottom: 6px; line-height: 1.4; }
.annot-list { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.annot-row { display: flex; align-items: flex-start; gap: 6px; font-size: 11px; line-height: 1.4; }
.annot-tag { flex-shrink: 0; font-size: 9px; font-weight: 700; letter-spacing: 0.5px; padding: 2px 5px; border-radius: 4px; margin-top: 1px; }
.annot-tag.warn { background: rgba(240,165,0,0.18); color: #f0a500; }
.annot-tag.todo { background: rgba(74,158,255,0.18); color: #4a9eff; }
.annot-tag.dead { background: rgba(160,160,160,0.15); color: #888; }
.annot-text { flex: 1; color: #a6adc8; }
.delegate-btn { flex-shrink: 0; background: rgba(74,158,255,0.12); border: 1px solid rgba(74,158,255,0.3); border-radius: 5px; color: #4a9eff; font-size: 10px; padding: 2px 7px; cursor: pointer; white-space: nowrap; }
.delegate-btn:hover { background: rgba(74,158,255,0.25); border-color: #4a9eff; }
#hover-tooltip { position: absolute; background: #1e1e2e; border: 1px solid #45475a; border-radius: 6px; padding: 10px 12px; font-size: 12px; color: #cdd6f4; pointer-events: none; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 250px; }
#hover-tooltip strong { color: #cba6f7; display: block; margin-bottom: 4px; font-size: 13px; }
.hidden { display: none !important; }
#map-legend { position: fixed; top: 50%; transform: translateY(-50%); left: 0; z-index: 50; display: flex; flex-direction: row-reverse; align-items: center; pointer-events: none; }
#legend-tab { pointer-events: auto; writing-mode: vertical-rl; text-orientation: mixed; background: #313244; color: #a6adc8; font-size: 10px; font-weight: 600; padding: 10px 5px; border-radius: 0 6px 6px 0; cursor: pointer; user-select: none; border: 1px solid rgba(255,255,255,0.08); border-left: none; letter-spacing: 0.5px; text-transform: uppercase; }
#legend-tab:hover { background: #45475a; color: #cdd6f4; }
#legend-panel { pointer-events: auto; width: 0; overflow: hidden; background: #181825; border-right: 1px solid rgba(255,255,255,0.08); border-top: 1px solid rgba(255,255,255,0.08); border-bottom: 1px solid rgba(255,255,255,0.08); border-radius: 0 6px 6px 0; transition: width 0.2s ease; display: flex; flex-direction: column; gap: 0; }
#legend-panel.open { width: 160px; }
#legend-inner { padding: 12px 12px; display: flex; flex-direction: column; gap: 7px; min-width: 160px; }
#legend-inner .lg-section { font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px; color: #585b70; margin-top: 4px; margin-bottom: 2px; font-weight: 700; }
#legend-inner .lg-row { display: flex; align-items: center; gap: 7px; font-size: 11px; color: #a6adc8; }
#legend-inner .lg-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
#legend-inner .lg-sym { font-size: 11px; width: 10px; text-align: center; flex-shrink: 0; }
`;
