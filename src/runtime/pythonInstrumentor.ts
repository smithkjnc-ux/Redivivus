// [SCOPE] Python instrumentation script generator for Runtime Analysis Engine.
// Produces chassis_trace.py — a sys.settrace() wrapper written to the project root.
// TEMPORARY — must be deleted after analysis (try/finally in caller).
// No vscode dependency.

/** Returns the content of chassis_trace.py as a string. */
export function buildPythonTraceScript(traceOutputPath: string, durationSeconds: number): string {
  // [WARN] All strings here are ASCII-only — this content is written to disk,
  //        not injected into a WebView, but keep it clean for consistency.
  const escapedPath = traceOutputPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `# chassis_trace.py -- CHASSIS Runtime Analysis instrumentation
# AUTO-GENERATED. DO NOT EDIT. Deleted automatically after analysis.
import sys
import os
import json
import time
import threading
import traceback

_TRACE_OUT = "${escapedPath}"
_DURATION  = ${durationSeconds}
_start     = time.time()
_lock      = threading.Lock()
_buf       = []
_flush_interval = 2  # seconds between buffer flushes

def _flush():
    global _buf
    if not _buf:
        return
    with _lock:
        batch = _buf[:]
        _buf = []
    try:
        existing = []
        if os.path.exists(_TRACE_OUT):
            with open(_TRACE_OUT, "r") as f:
                try:
                    existing = json.load(f)
                except Exception:
                    existing = []
        existing.extend(batch)
        with open(_TRACE_OUT, "w") as f:
            json.dump(existing, f)
    except Exception:
        pass

def _tracer(frame, event, arg):
    if time.time() - _start > _DURATION:
        return None  # stop tracing
    if event not in ("call", "return"):
        return _tracer
    filename = frame.f_code.co_filename
    # Skip stdlib and site-packages
    if "site-packages" in filename or filename.startswith("<"):
        return _tracer
    funcname = frame.f_code.co_name
    lineno   = frame.f_lineno
    rel_file = filename
    try:
        cwd = os.getcwd()
        if filename.startswith(cwd):
            rel_file = os.path.relpath(filename, cwd)
    except Exception:
        pass
    entry = {
        "type": "call" if event == "call" else "return",
        "file": rel_file,
        "func": funcname,
        "line": lineno,
        "ts":   round(time.time() - _start, 3),
    }
    with _lock:
        _buf.append(entry)
    return _tracer

# Patch subprocess to capture spawn calls
try:
    import subprocess as _sp
    _orig_popen = _sp.Popen.__init__
    def _patched_popen(self, args, *a, **kw):
        cmd = args if isinstance(args, str) else list(args)
        with _lock:
            _buf.append({"type": "subprocess", "cmd": cmd, "ts": round(time.time() - _start, 3)})
        return _orig_popen(self, args, *a, **kw)
    _sp.Popen.__init__ = _patched_popen
except Exception:
    pass

# Patch socket to capture connections
try:
    import socket as _sock
    _orig_connect = _sock.socket.connect
    def _patched_connect(self, address):
        try:
            host, port = address[0], address[1]
            with _lock:
                _buf.append({"type": "socket_connect", "host": host, "port": port, "ts": round(time.time() - _start, 3)})
        except Exception:
            pass
        return _orig_connect(self, address)
    _sock.socket.connect = _patched_connect
except Exception:
    pass

def _flush_loop():
    while time.time() - _start < _DURATION + 1:
        time.sleep(_flush_interval)
        _flush()

threading.Thread(target=_flush_loop, daemon=True).start()
sys.settrace(_tracer)
threading.settrace(_tracer)
`;
}
