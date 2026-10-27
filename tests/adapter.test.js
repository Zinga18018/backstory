import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GEMINI_ADAPTER_STATUS,
  GeminiAdapterDisabledError,
  requestGeminiQuestions,
} from '../optional-server/gemini-adapter.js';

test('Gemini status clearly states that the integration is unimplemented', () => {
  assert.deepEqual(GEMINI_ADAPTER_STATUS, {
    provider: 'gemini',
    enabled: false,
    implemented: false,
  });
  assert.ok(Object.isFrozen(GEMINI_ADAPTER_STATUS));
});

test('Gemini requests fail closed for every input, including enable flags', async () => {
  for (const request of [undefined, null, {}, { enabled: true, apiKey: 'test-placeholder' }]) {
    await assert.rejects(requestGeminiQuestions(request), (error) => {
      assert.ok(error instanceof GeminiAdapterDisabledError);
      assert.equal(error.code, 'GEMINI_ADAPTER_DISABLED');
      assert.match(error.message, /local practice questions/);
      assert.doesNotMatch(error.message, /test-placeholder/);
      return true;
    });
  }
});

test('disabled adapter neither inspects evidence nor calls a network transport', async () => {
  let requestRead = false;
  let networkCalls = 0;
  const request = new Proxy({}, {
    get() {
      requestRead = true;
      throw new Error('Evidence must not be read by a disabled adapter.');
    },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error('Network calls are forbidden in this test.');
  };
  try {
    await assert.rejects(requestGeminiQuestions(request), GeminiAdapterDisabledError);
    assert.equal(requestRead, false);
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
