// [SCOPE] Visual Contract Editor — shared data model

export type PropType = 'color' | 'text' | 'number' | 'select';
export type PropCategory = 'colors' | 'text' | 'layout' | 'effects' | 'structure';

export interface VisualProperty {
  id: string;
  label: string;
  type: PropType;
  value: string;
  file: string;          // relative path within projectRoot
  category: PropCategory;
  proOnly: boolean;      // hidden in plain mode
  // Stored as a serializable pattern for patcher — two-group regex: (prefix)(value)
  findRegex: string;
  findGroup: number;     // capture group index that holds the replaceable value
  unit?: string;         // 'px' | 'em' | '%' for number types
  options?: string[];    // for select type
  selectorCtx?: string;  // owning CSS selector or HTML tag for display
}

export interface VisualSection {
  id: string;
  label: string;
  elementTag: string;   // 'section' | 'header' | 'footer' | 'div' | 'nav'
  cssClass?: string;
}

export interface VisualContract {
  projectRoot: string;
  files: string[];
  properties: VisualProperty[];
  sections: VisualSection[];   // Pro mode — structural blocks found in HTML
  extractedAt: number;
}
