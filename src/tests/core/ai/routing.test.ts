// [SCOPE] Unit Test for Routing Complexity (Example)
import * as assert from 'assert';
import { assertMatchesBaseline } from '../../utils/baseline.js';

import { aiLogger } from '../../../core/ai/aiLogger.js';
import { initMasterLogger } from '../../../core/logging/masterLogger.js';
import { fallbackClassify } from '../../../core/ai/chatPanelClassifierOverrides.js';
import { mochaHooks } from '../../utils/logDumper.js';
import { setupNockMock } from '../../utils/nockHelper.js';

suite('Core AI Routing Unit Tests', () => {
  setup(() => {
    initMasterLogger(process.cwd());
  });

  teardown(mochaHooks.afterEach);

  test('fallbackClassify should correctly identify a build intent', () => {
    aiLogger.info("Testing fallbackClassify with build intent");
    const result = fallbackClassify('build a simple web app');
    assertMatchesBaseline('fallback_classify_build', result);
  });

  test('AI mock returns baseline data', async () => {
    aiLogger.info("Testing mocked AI response against baseline");
    // This creates src/tests/__mocks__/ai_routing.json on first run
    setupNockMock('ai', '/v1beta/models/gemini-1.5-flash:generateContent', 'routing');
    
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', { method: 'POST' });
    const data = await res.json();
    
    // This creates src/tests/__baselines__/ai_routing_mock.json on first run
    assertMatchesBaseline('ai_routing_mock', data);
  });
});
