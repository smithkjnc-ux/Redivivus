// [SCOPE] Utility functions shared across all AI providers

/** Classify raw caught errors into a human-readable message */
export function classifyError(err: any, model: string): string {
  const msg: string = err?.message || String(err);
  if (err?.name === 'AbortError' || msg.includes('aborted') || msg.includes('abort')) {
    return `Request timed out. The ${model} API did not respond in time. Try a shorter prompt or check your network.`;
  }
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
    return `Network error: ${msg}. Check your internet connection.`;
  }
  if (msg.includes('JSON') || msg.includes('Unexpected token') || msg.includes('SyntaxError')) {
    return `Failed to parse ${model} response as JSON. The API may be down or returning HTML. Raw: ${msg}`;
  }
  return msg;
}
