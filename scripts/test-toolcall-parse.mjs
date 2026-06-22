// Verify the tolerant tool-call parser accepts the formats real models emit — especially Gemini's
// <tool_code>, which was being silently dropped. Run with: node scripts/test-toolcall-parse.mjs (after compile)

import assert from 'assert';
import { matchToolCall } from '../out/services/ai/agentToolCallParse.js';

let passed = 0, failed = 0;
const test = (n, fn) => { try { fn(); console.log(`  ✓ ${n}`); passed++; } catch (e) { console.log(`  ✗ ${n}\n    ${e.message}`); failed++; } };
const parse = (t) => { const m = matchToolCall(t); return m ? JSON.parse(m[1]) : null; };

test('still parses the canonical <tool_call>', () => {
  const d = parse('<tool_call>\n{ "name": "read_file", "args": { "filePath": "index.html" } }\n</tool_call>');
  assert.strictEqual(d.name, 'read_file');
  assert.strictEqual(d.args.filePath, 'index.html');
});

// The EXACT block from the screenshot that was being dropped.
test('parses Gemini <tool_code> run_command', () => {
  const d = parse('To address the prompt, I will run:\n<tool_code>\n{\n  "name": "run_command",\n  "args": {\n    "command": "npm test"\n  }\n}\n</tool_code>');
  assert.strictEqual(d.name, 'run_command');
  assert.strictEqual(d.args.command, 'npm test');
});

test('captures nested args object whole (not truncated at first })', () => {
  const d = parse('<tool_code>{"name":"write_file","args":{"filePath":"a.js","content":"x"}}</tool_code>');
  assert.strictEqual(d.name, 'write_file');
  assert.strictEqual(d.args.filePath, 'a.js');
  assert.strictEqual(d.args.content, 'x');
});

test('parses a ```tool_code fenced block', () => {
  const d = parse('Here:\n```tool_code\n{ "name": "list_dir", "args": { "dirPath": "." } }\n```');
  assert.strictEqual(d.name, 'list_dir');
});

test('parses a ```json fenced block that has a name field', () => {
  const d = parse('```json\n{"name":"read_file","args":{"filePath":"schema.prisma"}}\n```');
  assert.strictEqual(d.name, 'read_file');
});

test('does NOT grab a plain ```json data block with no name', () => {
  assert.strictEqual(matchToolCall('```json\n{"foo": 1, "bar": 2}\n```'), null);
});

test('returns null for prose with no tool call', () => {
  assert.strictEqual(matchToolCall('I have completed the task and all tests pass.'), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
