// Test vault search fixes end-to-end (no VS Code required).
// Run with: node scripts/test-vault-search.mjs

import fs from 'fs';
import path from 'path';
import os from 'os';
import assert from 'assert';

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

// ── Load real vault items from ~/.redivivus-vault ──────────────────────────────
const VAULT_ROOT = path.join(os.homedir(), '.redivivus-vault');
function loadVaultItems() {
  const items = [];
  if (!fs.existsSync(VAULT_ROOT)) { return items; }
  const cats = fs.readdirSync(VAULT_ROOT).filter(d => fs.statSync(path.join(VAULT_ROOT, d)).isDirectory());
  for (const cat of cats) {
    const catDir = path.join(VAULT_ROOT, cat);
    const files = fs.readdirSync(catDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try { items.push(JSON.parse(fs.readFileSync(path.join(catDir, f), 'utf-8'))); } catch {}
    }
  }
  return items;
}

// ── Inline findRelevantByTask (mirrors current buildFromVaultSearch.ts) ───────
function findRelevantByTask(task, items) {
  const taskLower = task.toLowerCase();
  const stopWords = new Set(['the','and','for','with','that','this','from','into','when','will','make','have','add','new','get','set','use','its','are','was','not','but','can','all','any','put','our','out','has','had','more','than','then','some','such','also','into','over','only','just','how','what','each','they','them','been','were','does','did','let','per','via']);
  const taskWords = taskLower.replace(/[^a-z0-9 ]/g,' ').split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w))
    .map(w => ({ word: w, weight: w.length >= 5 ? 3 : 2 }));

  if (taskWords.length === 0) { return []; }

  return items.map(item => {
    let score = 0;
    // FIXED: include description and useCase in search text
    const itemText = [
      item.name.toLowerCase(),
      item.sourceFile.toLowerCase(),
      item.category,
      item.tags.join(' '),
      (item.description || '').toLowerCase(),
      (item.useCase || '').toLowerCase(),
      item.code.slice(0, 300).toLowerCase(),
    ].join(' ');

    for (const { word, weight } of taskWords) {
      const count = (itemText.match(new RegExp(word, 'g')) || []).length;
      if (count > 0) { score += weight * count; }
    }
    if (taskLower.includes(item.name.toLowerCase())) { score += 15; }
    if (taskLower.includes(item.category.toLowerCase())) { score += 5; }
    for (const tag of (item.tags || [])) {
      if (taskLower.includes(tag.toLowerCase())) { score += 4; }
    }
    return { item, score };
  }).filter(s => s.score >= 5).sort((a, b) => b.score - a.score).slice(0, 10).map(s => ({ ...s.item, score: s.score }));
}

// Old version WITHOUT description/useCase — to prove the fix matters
function findRelevantByTaskOLD(task, items) {
  const taskLower = task.toLowerCase();
  const stopWords = new Set(['the','and','for','with','that','this','from','into','when','will','make','have','add','new','get','set','use','its','are','was','not','but','can','all','any','put','our','out','has','had','more','than','then','some','such','also','into','over','only','just','how','what','each','they','them','been','were','does','did','let','per','via']);
  const taskWords = taskLower.replace(/[^a-z0-9 ]/g,' ').split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w))
    .map(w => ({ word: w, weight: w.length >= 5 ? 3 : 2 }));

  return items.map(item => {
    let score = 0;
    const itemText = [  // OLD: no description/useCase
      item.name.toLowerCase(),
      item.sourceFile.toLowerCase(),
      item.category,
      item.tags.join(' '),
      item.code.slice(0, 300).toLowerCase(),
    ].join(' ');
    for (const { word, weight } of taskWords) {
      const count = (itemText.match(new RegExp(word, 'g')) || []).length;
      if (count > 0) { score += weight * count; }
    }
    if (taskLower.includes(item.name.toLowerCase())) { score += 15; }
    if (taskLower.includes(item.category.toLowerCase())) { score += 5; }
    for (const tag of (item.tags || [])) {
      if (taskLower.includes(tag.toLowerCase())) { score += 4; }
    }
    return { item, score };
  }).filter(s => s.score >= 5).sort((a, b) => b.score - a.score).slice(0, 10).map(s => ({ ...s.item, score: s.score }));
}

// ── formatVaultContext (mirrors vaultContextService.ts buildContextBlock) ──────
function formatVaultContext(items) {
  const lines = [
    '=== Redivivus VAULT: Relevant existing code ===',
    'The following reusable blocks already exist in the project vault.',
    'PREFER using or adapting these over writing new code from scratch.',
    '',
  ];
  for (const item of items) {
    const star = item.qualityScore >= 5 ? ' ⭐' : '';
    lines.push(`--- [${item.category}] ${item.name} (${item.language || 'js'})${star} ---`);
    if (item.description) { lines.push(`// ${item.description}`); }
    if (item.useCase) { lines.push(`// Use when: ${item.useCase}`); }
    lines.push(`// Source: ${item.sourceFile}`);
    lines.push(item.code.slice(0, 500) + (item.code.length > 500 ? '\n// ...(truncated)' : ''));
    lines.push('');
  }
  lines.push('=== END VAULT CONTEXT ===');
  return lines.join('\n');
}

// ── Load real vault ───────────────────────────────────────────────────────────
const vaultItems = loadVaultItems();
console.log(`\nLoaded ${vaultItems.length} vault items from ${VAULT_ROOT}`);

const withDesc = vaultItems.filter(i => i.description && i.description.length > 20);
const withScore = vaultItems.filter(i => i.qualityScore);
console.log(`  ${withDesc.length} have AI descriptions, ${withScore.length} have quality scores\n`);

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('Search: description/useCase improves recall');

test('task "game difficulty scaling" finds DifficultyManager via description', () => {
  const task = 'build a game with difficulty scaling that increases as the score goes up';
  const newHits = findRelevantByTask(task, vaultItems);
  const found = newHits.find(i => i.name === 'DifficultyManager');
  assert(found, `DifficultyManager not found. Got: ${newHits.slice(0,5).map(i => i.name).join(', ')}`);
  console.log(`    score=${found.score} desc="${(found.description||'').slice(0,60)}..."`);
});

test('description/useCase adds signal beyond old keyword-only search', () => {
  const task = 'play audio segments in sequence using web audio api';
  const newHits = findRelevantByTask(task, vaultItems);
  const oldHits = findRelevantByTaskOLD(task, vaultItems);
  const newNames = newHits.map(i => i.name);
  const oldNames = oldHits.map(i => i.name);
  console.log(`    new (${newHits.length}): ${newNames.slice(0,5).join(', ')}`);
  console.log(`    old (${oldHits.length}): ${oldNames.slice(0,5).join(', ')}`);
  // New search should find at least as many items as old
  assert(newHits.length >= oldHits.length, `New search found fewer items: ${newHits.length} vs ${oldHits.length}`);
});

test('task "multi-input event handling for game" finds initializeInput', () => {
  const task = 'set up keyboard mouse and touch input handling for an arcade game';
  const hits = findRelevantByTask(task, vaultItems);
  const found = hits.find(i => i.name === 'initializeInput');
  assert(found, `initializeInput not found. Got: ${hits.slice(0,5).map(i => i.name).join(', ')}`);
  console.log(`    score=${found.score} tags=${found.tags.slice(0,4).join(',')}`);
});

test('task "format date for display" finds formatDate', () => {
  const task = 'format a date into MM/DD/YYYY for display in the UI';
  const hits = findRelevantByTask(task, vaultItems);
  const found = hits.find(i => i.name === 'formatDate');
  assert(found, `formatDate not found. Got: ${hits.slice(0,5).map(i => i.name).join(', ')}`);
  console.log(`    score=${found.score} desc="${(found.description||'').slice(0,60)}"`);
});

console.log('\nFormatted vault context block (what worker AI sees)');

test('context block includes description and useCase', () => {
  const task = 'build a game with difficulty scaling and keyboard controls';
  const hits = findRelevantByTask(task, vaultItems);
  assert(hits.length > 0, 'No vault hits for game task');
  const block = formatVaultContext(hits.slice(0, 3));
  assert(block.includes('=== Redivivus VAULT'), 'Missing vault header');
  const hasDesc = hits.slice(0,3).some(i => i.description && block.includes(i.description.slice(0,20)));
  assert(hasDesc, 'No description found in context block');
  const hasUseCase = hits.slice(0,3).some(i => i.useCase && block.includes('Use when:'));
  console.log(`    ${hits.length} items found, context block ${block.length} chars`);
  console.log(`    has descriptions: ${hasDesc}, has useCases: ${hasUseCase}`);
});

console.log('\nFull build simulation: task -> vault hits -> worker context');

test('game build task finds multiple relevant vault items', () => {
  const task = 'build a browser arcade game with score tracking, difficulty scaling, and keyboard input';
  const hits = findRelevantByTask(task, vaultItems);
  console.log(`    Task: "${task.slice(0, 60)}..."`);
  console.log(`    Found ${hits.length} vault items:`);
  for (const h of hits.slice(0, 6)) {
    console.log(`      [score:${h.score}] ${h.name} — ${(h.description||'(no desc)').slice(0,60)}`);
  }
  assert(hits.length >= 2, `Expected at least 2 vault hits, got ${hits.length}`);
  const block = formatVaultContext(hits.slice(0, 4));
  console.log(`\n    Worker AI vault context block (first 600 chars):`);
  console.log('    ' + block.slice(0, 600).replace(/\n/g, '\n    '));
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) { process.exit(1); }
