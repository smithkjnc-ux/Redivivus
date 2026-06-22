// [SCOPE] Chat Panel Renderer — escapeHtml, encodeBase64, and re-export of renderMessages.
// renderMessages() extracted to chatPanelRenderMessages.ts (Rule 9 split — was 223 lines).

export function escapeHtml(text: string): string {
  const map: { [key: string]: string } = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

export function encodeBase64(text: string): string {
  return Buffer.from(text).toString('base64');
}

export { renderMessages } from './chatPanelRenderMessages';
