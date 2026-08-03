export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  fallbackModels: string[];
  promptVersion: string;
}

export interface RuntimeConfig {
  detailBatchSize: number;
  requestTimeoutMs: number;
  connectorConcurrency: number;
  deferredAuditLimit: number;
  maxResponseBytes: number;
  openRouter: OpenRouterConfig | null;
}

export function loadRuntimeConfig(env: Record<string, string | undefined>): RuntimeConfig {
  const apiKey = env.OPENROUTER_API_KEY?.trim() || '';
  const model = env.OPENROUTER_MODEL?.trim() || '';
  if (model === 'openrouter/free') throw new Error('OPENROUTER_MODEL must be a concrete model slug');
  const fallbackModels = (env.OPENROUTER_FALLBACK_MODELS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (fallbackModels.includes('openrouter/free')) {
    throw new Error('OpenRouter fallbacks must use concrete model slugs');
  }

  return {
    detailBatchSize: integer(env.DETAIL_BATCH_SIZE, 25, 1, 100),
    requestTimeoutMs: integer(env.REQUEST_TIMEOUT_MS, 20_000, 5_000, 60_000),
    connectorConcurrency: integer(env.CONNECTOR_CONCURRENCY, 3, 1, 8),
    deferredAuditLimit: integer(env.DEFERRED_AUDIT_LIMIT, 2, 0, 10),
    maxResponseBytes: integer(env.MAX_RESPONSE_BYTES, 1_000_000, 100_000, 2_000_000),
    openRouter: apiKey && model ? {
      apiKey,
      model,
      fallbackModels,
      promptVersion: env.OPENROUTER_PROMPT_VERSION?.trim() || 'job-classification-v1',
    } : null,
  };
}

function integer(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

