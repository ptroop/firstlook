import assert from 'node:assert/strict';
import test from 'node:test';

import { loadRuntimeConfig } from './config.ts';

test('bounds scan settings and disables incomplete OpenRouter configuration', () => {
  const config = loadRuntimeConfig({
    DETAIL_BATCH_SIZE: '9999',
    REQUEST_TIMEOUT_MS: '-1',
    CONNECTOR_CONCURRENCY: '4',
    DEFERRED_AUDIT_LIMIT: '3',
    MAX_RESPONSE_BYTES: '500000',
    OPENROUTER_API_KEY: 'secret-for-test',
  });

  assert.equal(config.detailBatchSize, 100);
  assert.equal(config.detailConcurrency, 4);
  assert.equal(config.requestTimeoutMs, 5_000);
  assert.equal(config.connectorConcurrency, 4);
  assert.equal(config.deferredAuditLimit, 3);
  assert.equal(config.maxResponseBytes, 500_000);
  assert.equal(config.openRouter, null);
});

test('rejects the random OpenRouter production router', () => {
  assert.throws(() => loadRuntimeConfig({
    OPENROUTER_API_KEY: 'secret-for-test',
    OPENROUTER_MODEL: 'openrouter/free',
  }), /concrete model/i);
});

test('keeps at most two concrete OpenRouter fallbacks and a fixed prompt version', () => {
  const config = loadRuntimeConfig({
    OPENROUTER_API_KEY: 'test-only-key',
    OPENROUTER_MODEL: 'google/gemini-2.5-flash-lite',
    OPENROUTER_FALLBACK_MODELS: 'openai/gpt-4.1-mini, anthropic/claude-3.5-haiku, meta/llama-4',
    OPENROUTER_PROMPT_VERSION: 'finance-entry-v2',
  });
  assert.deepEqual(config.openRouter?.fallbackModels, ['openai/gpt-4.1-mini', 'anthropic/claude-3.5-haiku']);
  assert.equal(config.openRouter?.promptVersion, 'finance-entry-v2');
});
