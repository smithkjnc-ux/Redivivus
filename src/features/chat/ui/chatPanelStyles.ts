// [SCOPE] Chat Panel CSS — assembler that combines all CSS chunks into one style block
// CSS vars + header + badges -> chatPanelStylesBase.ts
// Conversation + messages + code blocks + onboarding -> chatPanelStylesMid.ts
// Input area + dynamic panels + functions + spinner -> chatPanelStylesInput.ts

import { buildChatCssBase } from './chatPanelStylesBase.js';
import { buildChatCssMid } from './chatPanelStylesMid.js';
import { buildChatCssInput } from './chatPanelStylesInput.js';
import { buildChatCssDash } from './chatPanelStylesDash.js';

export function buildChatCss(): string {
  return buildChatCssBase() + buildChatCssMid() + buildChatCssDash() + buildChatCssInput();
}
