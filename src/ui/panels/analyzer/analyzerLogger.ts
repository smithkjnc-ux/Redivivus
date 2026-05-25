// [SCOPE] Redivivus ANALYZER Domain Logger
import { masterLog } from '../../../core/logging/masterLogger.js';

const DOMAIN = 'ANALYZER';

export const analyzerLogger = {
  debug: (message: string, data?: unknown) => masterLog('DEBUG', DOMAIN, message, data),
  info: (message: string, data?: unknown) => masterLog('INFO', DOMAIN, message, data),
  error: (message: string, data?: unknown) => masterLog('ERROR', DOMAIN, message, data)
};
