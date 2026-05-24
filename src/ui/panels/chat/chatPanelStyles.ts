// [SCOPE] Chat Panel CSS — assembler that combines all CSS chunks into one style block
// CSS vars + header + badges -> chatPanelStylesBase.ts
// Conversation + messages + code blocks + onboarding -> chatPanelStylesMid.ts
// Input area + dynamic panels + functions + spinner -> chatPanelStylesInput.ts

import { buildChatCssBase } from './chatPanelStylesBase';
import { buildChatCssMid } from './chatPanelStylesMid';
import { buildChatCssInput } from './chatPanelStylesInput';
import { buildChatCssDash } from './chatPanelStylesDash';

export function buildChatCss(): string {
  return buildChatCssBase() + buildChatCssMid() + buildChatCssDash() + buildChatCssInput();
}
