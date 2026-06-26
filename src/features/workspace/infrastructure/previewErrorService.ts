// [SCOPE] Preview Error Service — stores browser console errors captured from the live preview iframe.
// Errors are cleared when preview starts and accumulated until the next fix request reads them.

export interface PreviewError {
  type: 'error' | 'unhandled' | 'console' | 'fetch';
  message: string;
  source?: string;
  line?: number;
  col?: number;
  timestamp: number;
}

let _captured: PreviewError[] = [];

export function recordPreviewErrors(errors: PreviewError[]): void {
  _captured = [..._captured, ...errors].slice(-30);
}

export function getPreviewErrors(): PreviewError[] { return _captured; }

export function clearPreviewErrors(): void { _captured = []; }
