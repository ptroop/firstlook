import assert from 'node:assert/strict';
import test from 'node:test';

import type { OpenRouterConfig } from '../config.ts';
import { classifyWithOpenRouter, type OpenRouterCache, type OpenRouterClassification } from './openrouter.ts';

const config: OpenRouterConfig = {
  apiKey: 'test-only-key',
  model: 'google/gemini-2.5-flash-lite',
  fallbackModels: ['openai/gpt-4.1-mini', 'anthropic/claude-3.5-haiku'],
  promptVersion: 'job-classification-v1',
};

const input = {
  jobId: 'citi_105',
  descriptionHash: 'hash-105',
  title: 'Model/Anlys/Valid Analyst I - C09',
  location: 'Mumbai, Maharashtra, India',
  description: 'Credit risk model validation. Candidates should have 0-2 years of relevant experience.',
  jobCategory: 'Risk Management',
  experienceText: '0-2 years of relevant experience',
  deterministic: {
    locationStatus: 'india' as const,
    financeStatus: 'likely' as const,
    experienceStatus: 'zero_to_two' as const,
    minimumYears: 0,
    maximumYears: 2,
    matchTier: 'possible' as const,
    classificationMethod: 'deterministic' as const,
    evidence: { location: ['India'], finance: ['credit risk'], experience: ['0-2 years'] },
  },
};

test('accepts strict schema output and records requested and actual models', async () => {
  const calls: Array<{ authorization: string | null; body: any }> = [];
  const result = await classifyWithOpenRouter(input, {
    config,
    fetcher: async (_url, init) => {
      calls.push({
        authorization: new Headers(init?.headers).get('Authorization'),
        body: JSON.parse(String(init?.body)),
      });
      return modelResponse(validPayload(), 'google/gemini-2.5-flash-lite-001');
    },
  });

  assert.equal(result.finalResult.matchTier, 'exact');
  assert.equal(result.finalResult.classificationMethod, 'mixed');
  assert.equal(result.requestedModelId, config.model);
  assert.equal(result.actualModelId, 'google/gemini-2.5-flash-lite-001');
  assert.equal(result.confidence, 0.94);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].authorization, 'Bearer test-only-key');
  assert.equal(calls[0].body.response_format.type, 'json_schema');
  assert.equal(calls[0].body.response_format.json_schema.strict, true);
  assert.doesNotMatch(JSON.stringify(result), /test-only-key/);
});

test('malformed JSON fails closed to visible pending/possible', async () => {
  const result = await classifyWithOpenRouter(input, {
    config: { ...config, fallbackModels: [] },
    fetcher: async () => modelResponseText('{not-json', config.model),
  });
  assertPending(result, /JSON/i);
});

test('wrong schema fails closed to visible pending/possible', async () => {
  const result = await classifyWithOpenRouter(input, {
    config: { ...config, fallbackModels: [] },
    fetcher: async () => modelResponse({ finance: 'yes' }, config.model),
  });
  assertPending(result, /schema/i);
});

test('unsupported structured output gets one compatibility fallback', async () => {
  const bodies: any[] = [];
  const result = await classifyWithOpenRouter(input, {
    config,
    fetcher: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length === 1) return new Response(JSON.stringify({ error: { message: 'response_format json_schema unsupported' } }), { status: 400 });
      return modelResponse(validPayload(), 'openai/gpt-4.1-mini-2026-01-01');
    },
  });
  assert.equal(result.finalResult.matchTier, 'exact');
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].model, 'openai/gpt-4.1-mini');
  assert.equal(bodies[1].response_format.type, 'json_object');
});

test('timeout leaves the job pending and does not throw', async () => {
  const result = await classifyWithOpenRouter(input, {
    config: { ...config, fallbackModels: [] },
    timeoutMs: 5,
    fetcher: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }),
  });
  assertPending(result, /timeout/i);
});

test('429 quota exhaustion tries one concrete fallback model', async () => {
  const models: string[] = [];
  const result = await classifyWithOpenRouter(input, {
    config,
    fetcher: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      models.push(body.model);
      if (models.length === 1) return new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 429 });
      return modelResponse(validPayload(), 'openai/gpt-4.1-mini');
    },
  });
  assert.equal(result.finalResult.matchTier, 'exact');
  assert.deepEqual(models, ['google/gemini-2.5-flash-lite', 'openai/gpt-4.1-mini']);
});

test('never attempts more than one fallback', async () => {
  let calls = 0;
  const result = await classifyWithOpenRouter(input, {
    config,
    fetcher: async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 429 });
    },
  });
  assert.equal(calls, 2);
  assertPending(result, /HTTP 429/);
});

test('low confidence cannot promote an ambiguous deterministic result', async () => {
  const result = await classifyWithOpenRouter(input, {
    config: { ...config, fallbackModels: [] },
    fetcher: async () => modelResponse({ ...validPayload(), confidence: 0.61 }, config.model),
  });
  assertPending(result, /confidence/i);
});

test('evidence not grounded in the supplied job cannot promote it', async () => {
  const result = await classifyWithOpenRouter(input, {
    config: { ...config, fallbackModels: [] },
    fetcher: async () => modelResponse({
      ...validPayload(),
      evidence: { ...validPayload().evidence, finance: ['investment banking mergers and acquisitions'] },
    }, config.model),
  });
  assertPending(result, /evidence/i);
});

test('cache hit by job, description hash, and version makes no network call', async () => {
  const cached: OpenRouterClassification = {
    finalResult: { ...input.deterministic, classificationMethod: 'pending', matchTier: 'possible' },
    modelResult: null,
    requestedModelId: config.model,
    actualModelId: null,
    confidence: 0.6,
    validationErrors: ['prior quota failure'],
    cacheHit: false,
  };
  const cache: OpenRouterCache = {
    get: async (jobId, hash, version) => {
      assert.deepEqual([jobId, hash, version], ['citi_105', 'hash-105', 'job-classification-v1']);
      return cached;
    },
    set: async () => assert.fail('cache hit must not write'),
  };
  let calls = 0;
  const result = await classifyWithOpenRouter(input, {
    config,
    cache,
    fetcher: async () => { calls += 1; return modelResponse(validPayload(), config.model); },
  });
  assert.equal(calls, 0);
  assert.equal(result.cacheHit, true);
  assert.equal(result.validationErrors[0], 'prior quota failure');
});

test('missing OpenRouter configuration makes no network call', async () => {
  let calls = 0;
  const result = await classifyWithOpenRouter(input, {
    config: null,
    fetcher: async () => { calls += 1; return modelResponse(validPayload(), config.model); },
  });
  assert.equal(calls, 0);
  assertPending(result, /not configured/i);
});

function validPayload() {
  return {
    locationStatus: 'india',
    financeStatus: 'exact',
    experienceStatus: 'zero_to_two',
    minimumYears: 0,
    maximumYears: 2,
    confidence: 0.94,
    evidence: {
      location: ['Mumbai, Maharashtra, India'],
      finance: ['Credit risk model validation'],
      experience: ['0-2 years of relevant experience'],
    },
  };
}

function modelResponse(payload: unknown, model: string) {
  return modelResponseText(JSON.stringify(payload), model);
}

function modelResponseText(content: string, model: string) {
  return new Response(JSON.stringify({ model, choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function assertPending(result: OpenRouterClassification, error: RegExp) {
  assert.equal(result.finalResult.matchTier, 'possible');
  assert.equal(result.finalResult.classificationMethod, 'pending');
  assert.match(result.validationErrors.join(' '), error);
}
