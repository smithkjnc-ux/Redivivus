// [SCOPE] Guide markdown parser — mdToHtml function for minimal markdown-to-HTML conversion
// Called by guideService. No guide content or webview logic here.

export function mdToHtml(md: string): string {
  // Minimal markdown-to-HTML for the guide
  let html = md
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h2>$1</h2>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/```[\s\S]*?```/g, (m) => '<pre>' + m.replace(/```/g, '').trim() + '</pre>')
    .replace(/^\*\*([^*]+)\*\*/gm, '<strong>$1</strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^\|(.+)\|$/gm, (m) => {
      const cells = m.split('|').filter(c => c.trim() !== '').map(c => '<td>' + c.trim() + '</td>').join('');
      return '<tr>' + cells + '</tr>';
    })
    .replace(/<tr>(<td>[^<]+<\/td>)+<\/tr>/g, (m) => m.replace(/<td>([^<]+)<\/td>/g, '<th>$1</th>'));
  // wrap consecutive list items
  html = html.replace(/(<li>.*?<\/li>\n?)+/gs, (m) => '<ul>' + m.replace(/<\/li>\n<li>/g, '</li><li>') + '</ul>');
  // wrap consecutive table rows
  html = html.replace(/(<tr>.*?<\/tr>\n?)+/gs, (m) => '<table>' + m + '</table>');
  // line breaks for remaining plain text
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/^(?!<[hulpqt])(.+)$/gm, '<p>$1</p>');
  html = html.replace(/<\/p>\s*<p>/g, '</p>\n<p>');
  return html;
}
