// [SCOPE] Unit tests for the keyword-shortcut regexes (AI-audit fix #3) and the offline
// fallbackClassify intent classifier. A message corpus proves greedy false positives no longer
// match a shortcut while legitimate short commands still do.

import * as assert from 'assert';
import {
  TEMPLATES_SHORTCUT_RE,
  PROJECT_SCAN_SHORTCUT_RE,
  PROJECT_LIST_SHORTCUT_RE,
} from '../../../features/chat/logic/chatPanelMsgSendKeywords.js';
import { fallbackClassify } from '../../../features/ai/logic/chatPanelClassifierOverrides.js';

// Any of the three shortcut regexes firing = the message is intercepted before cloudChat.
function matchesAnyShortcut(msg: string): boolean {
  const m = msg.toLowerCase();
  return TEMPLATES_SHORTCUT_RE.test(m) || PROJECT_SCAN_SHORTCUT_RE.test(m) || PROJECT_LIST_SHORTCUT_RE.test(m);
}

suite('Keyword shortcut regexes (fix #3)', () => {
  // Ordinary sentences that happen to contain "project"/"templates" must fall through to cloudChat.
  const falsePositives = [
    'show me how this project handles errors',
    'change the project background color',
    'show me the project structure and explain it',
    'how does the templates folder get rendered',
    'why is this project using two build tools',
  ];
  for (const msg of falsePositives) {
    test(`does NOT hijack: "${msg}"`, () => {
      assert.strictEqual(matchesAnyShortcut(msg), false, `"${msg}" should fall through to cloudChat`);
    });
  }

  // Short imperative commands that SHOULD still be intercepted.
  const legit: Array<[string, RegExp]> = [
    ['list projects', PROJECT_LIST_SHORTCUT_RE],
    ['show my projects', PROJECT_LIST_SHORTCUT_RE],
    ['open project', PROJECT_LIST_SHORTCUT_RE],
    ['switch project', PROJECT_LIST_SHORTCUT_RE],
    ['open the redivivus project', PROJECT_LIST_SHORTCUT_RE],
    ['scan project for bugs', PROJECT_SCAN_SHORTCUT_RE],
    ['analyze the project', PROJECT_SCAN_SHORTCUT_RE],
    ['check my project', PROJECT_SCAN_SHORTCUT_RE],
    ['find problems', PROJECT_SCAN_SHORTCUT_RE],
    ['what templates do you have', TEMPLATES_SHORTCUT_RE],
    ['what can you build', TEMPLATES_SHORTCUT_RE],
    ['show me the templates', TEMPLATES_SHORTCUT_RE],
    ['list templates', TEMPLATES_SHORTCUT_RE],
  ];
  for (const [msg, re] of legit) {
    test(`still matches: "${msg}"`, () => {
      assert.ok(re.test(msg.toLowerCase()), `"${msg}" should match its shortcut`);
    });
  }
});

suite('fallbackClassify offline intent (fix #7a)', () => {
  const cases: Array<[string, string]> = [
    ['fix the login bug', 'fix'],
    ['the button doesn\'t work', 'fix'],
    ['no sound when I click play', 'fix'],
    ['build me a snake game', 'build'],
    ['add a dark mode toggle', 'build'],
    ['create a landing page', 'build'],
    ['what is a closure', 'question'],
    ['how does async await work', 'question'],
  ];
  for (const [msg, expected] of cases) {
    test(`"${msg}" -> ${expected}`, () => {
      assert.strictEqual(fallbackClassify(msg).type, expected);
    });
  }
});
