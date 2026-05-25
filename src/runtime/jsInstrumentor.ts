// [SCOPE] JavaScript instrumentation script generator for Runtime Analysis Engine.
// Produces redivivus_hook.js — a Node.js require() hook loaded via --require flag.
// TEMPORARY — must be deleted after analysis (try/finally in caller).
// No vscode dependency.

/** Returns the content of redivivus_hook.js as a string. */
export function buildJsHookScript(traceOutputPath: string, durationSeconds: number): string {
  // [WARN] ASCII-only content only. No emoji or Unicode in generated script.
  const escapedPath = traceOutputPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `// redivivus_hook.js -- Redivivus Runtime Analysis instrumentation
// AUTO-GENERATED. DO NOT EDIT. Deleted automatically after analysis.
'use strict';
const fs   = require('fs');
const path = require('path');
const _out = "${escapedPath}";
const _dur = ${durationSeconds} * 1000;
const _t0  = Date.now();
let _buf = [];
let _done = false;

function _flush() {
  if (!_buf.length) return;
  const batch = _buf.splice(0);
  try {
    let existing = [];
    if (fs.existsSync(_out)) {
      try { existing = JSON.parse(fs.readFileSync(_out, 'utf8')); } catch(e) {}
    }
    fs.writeFileSync(_out, JSON.stringify(existing.concat(batch)), 'utf8');
  } catch(e) {}
}

// Flush every 2 seconds
const _timer = setInterval(() => {
  _flush();
  if (Date.now() - _t0 > _dur + 1000) { clearInterval(_timer); _done = true; }
}, 2000);
_timer.unref(); // don't keep process alive

// Wrap require() to track dynamic imports
const Module = require('module');
const _origLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (!_done && Date.now() - _t0 < _dur) {
    _buf.push({ type: 'require', module: request, from: parent && parent.filename || '', ts: Date.now() - _t0 });
  }
  return _origLoad.apply(this, arguments);
};

// Wrap EventEmitter.emit to track events
try {
  const EventEmitter = require('events');
  const _origEmit = EventEmitter.prototype.emit;
  EventEmitter.prototype.emit = function(eventName) {
    if (!_done && Date.now() - _t0 < _dur && typeof eventName === 'string') {
      _buf.push({ type: 'event', name: eventName, ts: Date.now() - _t0 });
    }
    return _origEmit.apply(this, arguments);
  };
} catch(e) {}

// Wrap ws WebSocket constructor to track connections
try {
  const ws = require('ws');
  const _origWS = ws.WebSocket || ws;
  const _OrigProto = _origWS.prototype;
  const _origWSInit = _OrigProto._init || null;
  // Patch at construction time via Proxy if available
  if (typeof Proxy !== 'undefined') {
    // Minimal: just record when ws module is loaded (connection tracking via event above)
    _buf.push({ type: 'ws_module_loaded', ts: Date.now() - _t0 });
  }
} catch(e) {}

process.on('exit', _flush);
process.on('SIGTERM', () => { _flush(); process.exit(0); });
`;
}
