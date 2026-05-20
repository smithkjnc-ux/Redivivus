// [SCOPE] Jupyter Notebook Service -- read, parse, and edit .ipynb files.
// Allows CHASSIS to understand notebook structure, execute cells conceptually,
// and make targeted edits to specific cells without corrupting notebook JSON.

import * as fs from 'fs';
import * as path from 'path';

export interface NotebookCell {
  index: number;
  cellType: 'code' | 'markdown' | 'raw';
  source: string;
  outputs?: string[];
  executionCount?: number | null;
}

export interface NotebookInfo {
  filePath: string;
  cellCount: number;
  cells: NotebookCell[];
  kernelSpec?: string;
  language?: string;
}

/**
 * Read and parse a Jupyter notebook file.
 * Returns structured cell data without the full JSON overhead.
 */
export function readNotebook(filePath: string): NotebookInfo | null {
  try {
    if (!fs.existsSync(filePath) || !filePath.endsWith('.ipynb')) { return null; }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const nb = JSON.parse(raw);
    if (!nb.cells || !Array.isArray(nb.cells)) { return null; }

    const cells: NotebookCell[] = nb.cells.map((cell: any, idx: number) => {
      const source = Array.isArray(cell.source) ? cell.source.join('') : (cell.source || '');
      const outputs = (cell.outputs || []).map((o: any) => {
        if (o.text) { return Array.isArray(o.text) ? o.text.join('') : o.text; }
        if (o.data?.['text/plain']) { return Array.isArray(o.data['text/plain']) ? o.data['text/plain'].join('') : o.data['text/plain']; }
        return '[output]';
      }).filter(Boolean);
      return {
        index: idx,
        cellType: cell.cell_type || 'code',
        source,
        outputs: outputs.length > 0 ? outputs : undefined,
        executionCount: cell.execution_count ?? null,
      };
    });

    const kernelSpec = nb.metadata?.kernelspec?.display_name || nb.metadata?.kernelspec?.name;
    const language = nb.metadata?.kernelspec?.language || nb.metadata?.language_info?.name;

    return { filePath, cellCount: cells.length, cells, kernelSpec, language };
  } catch { return null; }
}

/**
 * Edit a specific cell in a notebook (by index).
 * Preserves all other cells and notebook metadata.
 */
export function editNotebookCell(filePath: string, cellIndex: number, newSource: string): boolean {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const nb = JSON.parse(raw);
    if (!nb.cells || cellIndex < 0 || cellIndex >= nb.cells.length) { return false; }

    // Convert source to array of lines (Jupyter format)
    const lines = newSource.split('\n').map((line, i, arr) => i < arr.length - 1 ? line + '\n' : line);
    nb.cells[cellIndex].source = lines;
    // Clear outputs for modified code cells
    if (nb.cells[cellIndex].cell_type === 'code') {
      nb.cells[cellIndex].outputs = [];
      nb.cells[cellIndex].execution_count = null;
    }

    fs.writeFileSync(filePath, JSON.stringify(nb, null, 1), 'utf-8');
    return true;
  } catch { return false; }
}

/**
 * Insert a new cell at a given position.
 */
export function insertNotebookCell(filePath: string, position: number, cellType: 'code' | 'markdown', source: string): boolean {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const nb = JSON.parse(raw);
    if (!nb.cells) { nb.cells = []; }
    const clampedPos = Math.min(Math.max(0, position), nb.cells.length);

    const lines = source.split('\n').map((line, i, arr) => i < arr.length - 1 ? line + '\n' : line);
    const newCell: any = { cell_type: cellType, source: lines, metadata: {} };
    if (cellType === 'code') { newCell.outputs = []; newCell.execution_count = null; }

    nb.cells.splice(clampedPos, 0, newCell);
    fs.writeFileSync(filePath, JSON.stringify(nb, null, 1), 'utf-8');
    return true;
  } catch { return false; }
}

/**
 * Build a readable text representation of a notebook for AI context.
 * Much cheaper than passing raw JSON.
 */
export function notebookToText(info: NotebookInfo): string {
  const header = `Notebook: ${path.basename(info.filePath)} (${info.cellCount} cells, ${info.language || 'python'})`;
  const cellTexts = info.cells.map(c => {
    const typeLabel = c.cellType === 'markdown' ? 'MD' : `In[${c.executionCount ?? ' '}]`;
    const outputStr = c.outputs?.length ? `\n  Out: ${c.outputs[0].slice(0, 200)}` : '';
    return `[${typeLabel}] ${c.source.slice(0, 500)}${outputStr}`;
  });
  return `${header}\n${cellTexts.join('\n---\n')}`;
}
