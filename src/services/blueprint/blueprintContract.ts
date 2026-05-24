// [SCOPE] Blueprint Contract -- extract and enforce shared API surface across multi-file builds
// Locks HTML IDs, globals, interfaces, and paradigm before generation begins.
// Injected into every file prompt after file 1 is written. Single source of truth for cross-file API drift.

export interface BlueprintContract {
  paradigm: 'global-vars' | 'es-modules' | 'class-based' | '';
  htmlIds: string[];
  globals: string[];
  interfaces: string[];
  cssClasses: string[];
}

export function emptyContract(): BlueprintContract {
  return { paradigm: '', htmlIds: [], globals: [], interfaces: [], cssClasses: [] };
}

export function extractContractFromCode(filename: string, code: string): BlueprintContract {
  const c = emptyContract();
  const isScript = /\.(js|ts|jsx|tsx)$/.test(filename);
  const isHtml = /\.html$/.test(filename);
  let m: RegExpExecArray | null;

  if (isScript) {
    if (/(?:^|\n)(?:import|export)\s/.test(code)) { c.paradigm = 'es-modules'; }
    else if (/(?:^|\n)class\s+\w+/.test(code)) { c.paradigm = 'class-based'; }
    else { c.paradigm = 'global-vars'; }
  }

  if (isHtml || isScript) {
    const idRe = /id=["']([^"']+)["']/g;
    while ((m = idRe.exec(code)) !== null) { c.htmlIds.push(m[1]); }
    const getByIdRe = /getElementById\(["']([^"']+)["']\)/g;
    while ((m = getByIdRe.exec(code)) !== null) { c.htmlIds.push(m[1]); }
    const qsRe = /querySelector\(["']#([^"']+)["']\)/g;
    while ((m = qsRe.exec(code)) !== null) { c.htmlIds.push(m[1]); }
  }

  // [WARN] Only extract globals for global-vars paradigm -- ES module exports are not globals
  if (isScript && c.paradigm === 'global-vars') {
    const gRe = /^(?:const|let|var)\s+(\w+)/gm;
    while ((m = gRe.exec(code)) !== null) { c.globals.push(m[1]); }
  }

  if (isScript) {
    const iRe = /^(?:export\s+)?interface\s+(\w+)/gm;
    while ((m = iRe.exec(code)) !== null) { c.interfaces.push(m[1]); }
  }

  if (isHtml) {
    const ccRe = /class=["']([^"']+)["']/g;
    while ((m = ccRe.exec(code)) !== null) { m[1].split(/\s+/).forEach(cl => { if (cl) { c.cssClasses.push(cl); } }); }
  }

  c.htmlIds = [...new Set(c.htmlIds)];
  c.globals = [...new Set(c.globals)];
  c.interfaces = [...new Set(c.interfaces)];
  c.cssClasses = [...new Set(c.cssClasses)];
  return c;
}

export function mergeContract(base: BlueprintContract, addition: BlueprintContract): BlueprintContract {
  return {
    paradigm: base.paradigm || addition.paradigm,
    htmlIds: [...new Set([...base.htmlIds, ...addition.htmlIds])],
    globals: [...new Set([...base.globals, ...addition.globals])],
    interfaces: [...new Set([...base.interfaces, ...addition.interfaces])],
    cssClasses: [...new Set([...base.cssClasses, ...addition.cssClasses])],
  };
}

export function buildContractBlock(contract: BlueprintContract): string {
  const isEmpty = !contract.paradigm && !contract.htmlIds.length && !contract.globals.length
    && !contract.interfaces.length && !contract.cssClasses.length;
  if (isEmpty) { return ''; }
  const lines: string[] = ['CONTRACT (already established -- do NOT deviate from these):'];
  if (contract.paradigm) { lines.push(`- Paradigm: ${contract.paradigm} -- ALL files MUST follow this`); }
  if (contract.htmlIds.length) { lines.push(`- HTML IDs in use: ${contract.htmlIds.join(', ')} -- reference these exact IDs, do NOT redefine`); }
  if (contract.globals.length) { lines.push(`- Global variables defined: ${contract.globals.slice(0, 20).join(', ')} -- do NOT redeclare`); }
  if (contract.interfaces.length) { lines.push(`- Interfaces defined: ${contract.interfaces.join(', ')} -- import and reuse, do NOT redefine`); }
  if (contract.cssClasses.length) { lines.push(`- CSS classes in use: ${contract.cssClasses.join(', ')} -- use these exact names`); }
  return lines.join('\n');
}

export interface ContractViolation {
  type: 'paradigm-mismatch' | 'global-redefined';
  detail: string;
}

export function detectContractViolations(code: string, filename: string, contract: BlueprintContract): ContractViolation[] {
  const violations: ContractViolation[] = [];
  if (!contract.paradigm) { return violations; }
  const isScript = /\.(js|ts|jsx|tsx)$/.test(filename);
  if (!isScript) { return violations; }
  // [WARN] Paradigm mismatch is the most critical violation -- import in a global-vars project breaks file:// loading
  if (contract.paradigm === 'global-vars' && /(?:^|\n)import\s/.test(code)) {
    violations.push({ type: 'paradigm-mismatch', detail: 'Uses import but contract requires global-vars -- file:// will fail with CORS errors' });
  }
  if (contract.paradigm === 'es-modules' && code.length > 300 && !/(?:^|\n)(?:import|export)\s/.test(code)) {
    violations.push({ type: 'paradigm-mismatch', detail: 'Missing import/export but contract requires es-modules paradigm' });
  }
  return violations;
}
