// [SCOPE] Redivivus CHAT Domain Logger
import { masterLog } from '../../../shared/logging/domain/masterLogger.js';

const DOMAIN = 'CHAT';

export const chatLogger = {
  debug: (message: string, data?: unknown) => masterLog('DEBUG', DOMAIN, message, data),
  info: (message: string, data?: unknown) => masterLog('INFO', DOMAIN, message, data),
  error: (message: string, data?: unknown) => masterLog('ERROR', DOMAIN, message, data)
};
