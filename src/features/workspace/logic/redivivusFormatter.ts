// [SCOPE] Redivivus Formatter — applies Redivivus annotation standards to raw vault code on use.
// Called at import-time or customize-time, never at save-time.
// Adds: // NARRATOR, // [SCOPE], edge-case guards if missing, annotation tags.
// [WARN] Only rewrites the header block — never touches function body logic.

/** Detects the comment style for the given language. */
function commentFor(lang: string): string {
  if (['python','ruby','shell','yaml'].includes(lang)) { return '#'; }
  if (['html','xml'].includes(lang)) { return '<!--'; }
  if (['css','scss'].includes(lang)) { return '/*'; }
  return '//';
}

/** Returns true if the code already has Redivivus annotations. */
function hasRedivivusAnnotations(code: string): boolean {
  return /\/\/\s*\[SCOPE\]|#\s*\[SCOPE\]|NARRATOR:/i.test(code);
}

/** Strips any existing bare import header Redivivus previously added so we don't double-up. */
function stripOldImportHeader(code: string): string {
  return code.replace(/^\/\/ Imported from Redivivus Vault[^\n]*\n/, '');
}

/** Infers a plain-English description of what the code does from its name and first few lines. */
function inferDescription(name: string, code: string): string {
  // Try to pull from existing first-line comment
  const firstComment = code.match(/^(?:\/\/|#)\s*(.+)/m);
  if (firstComment && firstComment[1].length > 10 && !/\[SCOPE\]|NARRATOR/i.test(firstComment[1])) {
    return firstComment[1].trim();
  }
  // Fall back to humanizing the name
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^./, c => c.toUpperCase());
}

/** Applies Redivivus formatting to raw code before it is used from the vault.
 *  Idempotent — safe to call multiple times, won't double-add annotations. */
export function redivivusFormat(code: string, name: string, lang = 'typescript'): string {
  const cleaned = stripOldImportHeader(code).trim();

  // Already formatted — nothing to do
  if (hasRedivivusAnnotations(cleaned)) { return cleaned; }

  const c = commentFor(lang);
  const desc = inferDescription(name, cleaned);
  const humanName = name.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');

  // Build the Redivivus header block
  const header = [
    `${c} NARRATOR: This module provides ${desc}.`,
    `${c} [SCOPE] ${humanName} — ${desc}.`,
    ``,
  ].join('\n');

  return header + cleaned;
}

/** Builds a Customize This prompt that includes the Redivivus-formatted code inline,
 *  so the AI receives properly annotated code as the base for customization. */
export function buildCustomizePrompt(name: string, code: string, lang = 'typescript'): string {
  const formatted = redivivusFormat(code, name, lang);
  const humanName = name.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return `Based on "${humanName}" from my vault, customize it to: \n\n` +
    `Here is the existing code for reference:\n\`\`\`${lang}\n${formatted}\n\`\`\`\n\n` +
    `Describe what you need changed or added: `;
}
