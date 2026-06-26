// [SCOPE] SSE stream drainer for the cloud build pipeline.
// Extracted from cloudBuildClient.ts (Rule 9 split).
// Routes @@RDV_STEP@@ / @@RDV_CODE@@ frames to callbacks; accumulates real file code into fullText.

const STEP_PREFIX = '@@RDV_STEP@@';
const CODE_PREFIX = '@@RDV_CODE@@';  // live worker-code chunk (Phase 2) — panel-only, stripped from disk code

export interface BuildStreamResult {
  fullText: string;
  workerInTok?: number;
  workerOutTok?: number;
  workerProviderFinal?: string;
}

export interface BuildStreamOpts {
  onStep?: (step: any) => void;
  onCode?: (text: string) => void;
  onChunk?: (text: string) => void;
}

/**
 * Drain the build SSE response body into full text + extract milestone frames.
 * The backend interleaves @@RDV_STEP@@ and @@RDV_CODE@@ frames with the code stream.
 * trimStart() on each line absorbs keep-alive spaces that prefix frame lines.
 */
export async function drainBuildStream(body: ReadableStream<Uint8Array>, opts: BuildStreamOpts): Promise<BuildStreamResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let workerInTok: number | undefined;
  let workerOutTok: number | undefined;
  let workerProviderFinal: string | undefined;

  const handleStep = (step: any) => {
    if (step && step.phase === 'done') {
      if (typeof step.inputTokens === 'number') { workerInTok = step.inputTokens; }
      if (typeof step.outputTokens === 'number') { workerOutTok = step.outputTokens; }
      if (typeof step.provider === 'string' && step.provider) { workerProviderFinal = step.provider; }
    }
    opts.onStep?.(step);
  };

  const routeFrame = (t: string): boolean => {
    if (t.startsWith(STEP_PREFIX)) { try { handleStep(JSON.parse(t.slice(STEP_PREFIX.length))); } catch {} return true; }
    if (t.startsWith(CODE_PREFIX)) { try { opts.onCode?.(JSON.parse(t.slice(CODE_PREFIX.length)).text || ''); } catch {} return true; }
    return false;
  };

  let lineBuf = '';
  const drain = (incoming: string, isFinal: boolean) => {
    lineBuf += incoming;
    let code = '';
    let nl: number;
    while ((nl = lineBuf.indexOf('\n')) >= 0) {
      const line = lineBuf.slice(0, nl);
      lineBuf = lineBuf.slice(nl + 1);
      if (!routeFrame(line.trimStart())) { code += line + '\n'; }
    }
    if (isFinal && lineBuf) {
      if (!routeFrame(lineBuf.trimStart())) { code += lineBuf; }
      lineBuf = '';
    }
    if (code) { fullText += code; opts.onChunk?.(code); }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) { break; }
    drain(decoder.decode(value, { stream: true }), false);
  }
  drain('', true);

  return { fullText, workerInTok, workerOutTok, workerProviderFinal };
}
