// [SCOPE] Recommendations panel HTML shell — document structure
// Section HTML is built in analyzerSections.ts. CSS and JS are in separate files.
import { RECOMMENDATIONS_CSS } from './analyzerStyles.js';
import { RECOMMENDATIONS_SCRIPT } from './analyzerScript.js';

export function buildRecommendationsHtml(sectionsHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>${RECOMMENDATIONS_CSS}</style></head><body>
<h1>C H A S S I S</h1>
<div class="subtitle">Project Recommendations</div>
${sectionsHtml}
<div class="toast" id="toast">🔧 Fix started — watch the Chat panel for progress</div>
${RECOMMENDATIONS_SCRIPT}
</body></html>`;
}
