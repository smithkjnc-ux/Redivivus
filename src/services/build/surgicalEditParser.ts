// [SCOPE] Surgical edit parser + format detector.
// Extracted from surgicalEditService.ts (Rule 9 split — was 355 lines).
// Parses AI SEARCH/REPLACE blocks (XML and legacy markdown format) into SurgicalEdit objects.

export interface SurgicalEdit {
  filePath: string;       // relative path
  searchBlock: string;    // exact text to find
  replaceBlock: string;   // text to replace with
}

export interface EditResult {
  filePath: string;
  success: boolean;
  editCount: number;
  error?: string;
  usedFallback?: boolean;
}

/** Parse AI response for SEARCH/REPLACE blocks (XML structured format or legacy markdown headers). */
export function parseSurgicalEdits(response: string, defaultFilePath: string = 'default'): SurgicalEdit[] {
  const edits: SurgicalEdit[] = [];

  // 1. Primary path: XML Structured Format
  const xmlFileRe = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;
  let xmlFileMatch: RegExpExecArray | null;
  let foundXml = false;

  while ((xmlFileMatch = xmlFileRe.exec(response)) !== null) {
    foundXml = true;
    const filePath = xmlFileMatch[1].trim();
    const fileContent = xmlFileMatch[2];

    const xmlEditRe = /<edit>[\s\S]*?<search>\n?([\s\S]*?)\n?<\/search>[\s\S]*?<replace>\n?([\s\S]*?)\n?<\/replace>[\s\S]*?<\/edit>/g;
    let xmlEditMatch: RegExpExecArray | null;
    let foundEdits = false;

    while ((xmlEditMatch = xmlEditRe.exec(fileContent)) !== null) {
      foundEdits = true;
      edits.push({ filePath, searchBlock: xmlEditMatch[1], replaceBlock: xmlEditMatch[2] });
    }

    if (!foundEdits) {
      // Full-file XML output handled by chatPanelMsgFixApply's <content> fallback
      const contentMatch = /<content>\n?([\s\S]*?)\n?<\/content>/.exec(fileContent);
      void contentMatch; // let upstream handle it
    }
  }

  if (foundXml) { return edits; }

  // 2. Legacy path: Markdown Headers + SEARCH/REPLACE blocks
  const filePattern = /^##\s+(?:Edit|Fix):\s*(.+?)\s*$/gm;
  let fileMatch: RegExpExecArray | null;
  const filePositions: Array<{ path: string; start: number }> = [];

  while ((fileMatch = filePattern.exec(response)) !== null) {
    filePositions.push({ path: fileMatch[1].trim(), start: fileMatch.index + fileMatch[0].length });
  }

  if (filePositions.length === 0) { filePositions.push({ path: defaultFilePath, start: 0 }); }

  for (let i = 0; i < filePositions.length; i++) {
    const fp = filePositions[i];
    const end = i + 1 < filePositions.length ? filePositions[i + 1].start : response.length;
    const section = response.slice(fp.start, end);
    const editBlockRe = /<<<SEARCH\n([\s\S]*?)\n===\n([\s\S]*?)\nREPLACE>>>/g;
    let editMatch: RegExpExecArray | null;
    while ((editMatch = editBlockRe.exec(section)) !== null) {
      edits.push({ filePath: fp.path, searchBlock: editMatch[1], replaceBlock: editMatch[2] });
    }
  }
  return edits;
}

/** Detect whether an AI response contains surgical edits, a unified diff, or full-file output. */
export function detectResponseFormat(response: string): 'surgical' | 'unified' | 'fullfile' {
  if (/<file\s+path=".*?">[\s\S]*?<edit>/m.test(response)) { return 'surgical'; }
  if (/<<<SEARCH\n[\s\S]*?\n===\n[\s\S]*?\nREPLACE>>>/m.test(response)) { return 'surgical'; }
  if (/^---\s+\S+\n\+\+\+\s+\S+/m.test(response)) { return 'unified'; }
  return 'fullfile';
}
