// [SCOPE] Redivivus AI Domain Logger
import { masterLog } from '../../logging/domain/masterLogger.js';

const DOMAIN = 'AI';

export const aiLogger = {
  debug: (message: string, data?: unknown) => masterLog('DEBUG', DOMAIN, message, data),
  info: (message: string, data?: unknown) => masterLog('INFO', DOMAIN, message, data),
  error: (message: string, data?: unknown) => masterLog('ERROR', DOMAIN, message, data)
};
