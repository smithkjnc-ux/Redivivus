// [SCOPE] Error capture script injected into preview HTML pages.
// Captures runtime JS errors, unhandled promise rejections, console.error calls, and fetch failures.
// Posts them to window.parent so the chat panel WebView can forward them to the fix pipeline.
// [RULE 13] All strings are ASCII-only -- no emoji, no Unicode literals.

export function buildErrorCaptureScript(): string {
  return `<script>
(function() {
  var _errs = [];
  var _flushed = false;
  function _send() {
    if (_flushed || _errs.length === 0) { return; }
    _flushed = true;
    try { window.parent.postMessage({ type: 'redivivus-preview-errors', errors: _errs }, '*'); } catch(e) {}
  }
  function _add(type, msg, src, line, col) {
    _errs.push({ type: type, message: String(msg).slice(0, 400), source: src || '', line: line || 0, col: col || 0, timestamp: Date.now() });
  }
  window.onerror = function(msg, src, line, col) { _add('error', msg, src, line, col); return false; };
  window.addEventListener('unhandledrejection', function(e) { _add('unhandled', e.reason ? (e.reason.message || String(e.reason)) : 'Unhandled promise rejection', '', 0, 0); });
  var _origError = console.error.bind(console);
  console.error = function() { _origError.apply(console, arguments); _add('console', Array.prototype.slice.call(arguments).join(' '), '', 0, 0); };
  var _origFetch = window.fetch;
  if (_origFetch) {
    window.fetch = function(url, opts) {
      return _origFetch.call(this, url, opts).catch(function(err) {
        _add('fetch', 'fetch() failed: ' + String(url) + ' -- ' + String(err.message || err), '', 0, 0);
        throw err;
      });
    };
  }
  setTimeout(_send, 2500);
  window.addEventListener('load', function() { setTimeout(_send, 1000); });
})();
</script>`;
}
