import type { OpenRouterConfig } from '../config.ts';
import type { ExperienceStatus, FinanceStatus, LocationStatus } from '../types.ts';
import type { DeterministicClassification, DeterministicJobInput } from './deterministic.ts';
import { composeMatchTier } from './deterministic.ts';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 20_000;
const MIN_CONFIDENCE = 0.75;

export interface OpenRouterInput extends DeterministicJobInput {
  jobId: string;
  descriptionHash: string;
  deterministic: DeterministicClassification;
}

export interface ModelClassification {
  locationStatus: LocationStatus;
  financeStatus: FinanceStatus;
  experienceStatus: Exclude<ExperienceStatus, 'unclassified'>;
  minimumYears: number | null;
  maximumYears: number | null;
  confidence: number;
  evidence: { location: string[]; finance: string[]; experience: string[] };
}

export interface OpenRouterClassification {
  finalResult: DeterministicClassification;
  modelResult: ModelClassification | null;
  requestedModelId: string | null;
  actualModelId: string | null;
  confidence: number;
  validationErrors: string[];
  cacheHit: boolean;
}

export interface OpenRouterCache {
  get(jobId: string, descriptionHash: string, version: string): Promise<OpenRouterClassification | null>;
  set(jobId: string, descriptionHash: string, version: string, value: OpenRouterClassification): Promise<void>;
}

export interface OpenRouterOptions {
  config: OpenRouterConfig | null;
  fetcher?: typeof fetch;
  cache?: OpenRouterCache;
  timeoutMs?: number;
}

export async function classifyWithOpenRouter(
  input: OpenRouterInput,
  options: OpenRouterOptions,
): Promise<OpenRouterClassification> {
  const config = options.config;
  if (!config) return pending(input.deterministic, null, ['OpenRouter is not configured']);

  if (options.cache) {
    try {
      const cached = await options.cache.get(input.jobId, input.descriptionHash, config.promptVersion);
      if (cached) return { ...cached, cacheHit: true };
    } catch (_error) {
      // Classification remains available when the optional cache is unavailable.
    }
  }

  const fetcher = options.fetcher ?? fetch;
  const errors: string[] = [];
  const attempts = [config.model, config.fallbackModels[0]].filter(Boolean);
  let structured = true;
  let lastRequestedModel = config.model;

  for (const model of attempts) {
    lastRequestedModel = model;
    const attempt = await requestClassification(input, config, model, structured, fetcher, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if ('error' in attempt) {
      errors.push(`${model}: ${attempt.error}`);
      if (attempt.unsupportedStructuredOutput) structured = false;
      continue;
    }

    const validationErrors = validateModelResult(attempt.value, input);
    if (validationErrors.length > 0) {
      errors.push(...validationErrors.map((error) => `${model}: ${error}`));
      continue;
    }
    if (attempt.value.confidence < MIN_CONFIDENCE) {
      errors.push(`${model}: confidence ${attempt.value.confidence} is below ${MIN_CONFIDENCE}`);
      continue;
    }

    const value: OpenRouterClassification = {
      finalResult: {
        locationStatus: attempt.value.locationStatus,
        financeStatus: attempt.value.financeStatus,
        experienceStatus: attempt.value.experienceStatus,
        minimumYears: attempt.value.minimumYears,
        maximumYears: attempt.value.maximumYears,
        matchTier: composeMatchTier(
          attempt.value.locationStatus,
          attempt.value.financeStatus,
          attempt.value.experienceStatus,
        ),
        classificationMethod: 'mixed',
        evidence: attempt.value.evidence,
      },
      modelResult: attempt.value,
      requestedModelId: model,
      actualModelId: attempt.actualModel,
      confidence: attempt.value.confidence,
      validationErrors: [],
      cacheHit: false,
    };
    await setCacheSafely(options.cache, input, config.promptVersion, value);
    return value;
  }

  const value = pending(input.deterministic, lastRequestedModel, errors.length > 0 ? errors : ['OpenRouter classification failed']);
  await setCacheSafely(options.cache, input, config.promptVersion, value);
  return value;
}

async function requestClassification(
  input: OpenRouterInput,
  config: OpenRouterConfig,
  model: string,
  structured: boolean,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<{ value: ModelClassification; actualModel: string | null } | { error: string; unsupportedStructuredOutput?: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://first-look.local',
        'X-Title': 'First Look Job Monitor',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content: 'Classify only from the supplied job text. Return JSON matching the schema. Evidence must quote short exact phrases from the supplied text. Never infer unstated experience.',
          },
          { role: 'user', content: JSON.stringify(boundedJobInput(input)) },
        ],
        response_format: structured
          ? { type: 'json_schema', json_schema: { name: 'job_classification', strict: true, schema: responseSchema() } }
          : { type: 'json_object' },
      }),
    });
    const raw = await readBoundedText(response, 64_000);
    if (!response.ok) {
      const unsupported = response.status === 400 && /(?:response_format|json_schema|structured).*(?:unsupported|not supported)|(?:unsupported|not supported).*(?:response_format|json_schema|structured)/i.test(raw);
      return { error: `HTTP ${response.status}${boundedApiMessage(raw)}`, unsupportedStructuredOutput: unsupported };
    }

    let envelope: unknown;
    try {
      envelope = JSON.parse(raw);
    } catch (_error) {
      return { error: 'response envelope was not valid JSON' };
    }
    if (!isRecord(envelope)) return { error: 'response envelope failed schema validation' };
    const actualModel = typeof envelope.model === 'string' ? envelope.model : null;
    const choices = Array.isArray(envelope.choices) ? envelope.choices : [];
    const first = isRecord(choices[0]) ? choices[0] : null;
    const message = first && isRecord(first.message) ? first.message : null;
    if (!message || typeof message.content !== 'string') return { error: 'response content failed schema validation' };

    let parsed: unknown;
    try {
      parsed = JSON.parse(message.content);
    } catch (_error) {
      return { error: 'model content was not valid JSON' };
    }
    const value = parseModelResult(parsed);
    return value ? { value, actualModel } : { error: 'model content failed schema validation' };
  } catch (error) {
    if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return { error: `request timeout after ${timeoutMs}ms` };
    }
    return { error: error instanceof Error ? error.message : 'request failed' };
  } finally {
    clearTimeout(timer);
  }
}

function parseModelResult(value: unknown): ModelClassification | null {
  if (!isRecord(value)) return null;
  if (!isOneOf(value.locationStatus, ['india', 'not_india', 'uncertain'])) return null;
  if (!isOneOf(value.financeStatus, ['exact', 'likely', 'unrelated', 'unclassified'])) return null;
  if (!isOneOf(value.experienceStatus, ['zero_to_two', 'ambiguous', 'over_two'])) return null;
  if (!nullableBoundedNumber(value.minimumYears) || !nullableBoundedNumber(value.maximumYears)) return null;
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) return null;
  if (!isRecord(value.evidence)) return null;
  const location = evidenceArray(value.evidence.location);
  const finance = evidenceArray(value.evidence.finance);
  const experience = evidenceArray(value.evidence.experience);
  if (!location || !finance || !experience) return null;
  return {
    locationStatus: value.locationStatus,
    financeStatus: value.financeStatus,
    experienceStatus: value.experienceStatus,
    minimumYears: value.minimumYears,
    maximumYears: value.maximumYears,
    confidence: value.confidence,
    evidence: { location, finance, experience },
  };
}

function validateModelResult(value: ModelClassification, input: OpenRouterInput): string[] {
  const errors: string[] = [];
  if (value.minimumYears !== null && value.maximumYears !== null && value.minimumYears > value.maximumYears) {
    errors.push('minimumYears exceeds maximumYears');
  }
  const supplied = normalizeEvidence([input.title, input.location, input.description, input.jobCategory, input.experienceText].join(' '));
  for (const [kind, evidence] of Object.entries(value.evidence)) {
    if (evidence.length === 0 && statusNeedsEvidence(kind, value)) errors.push(`${kind} evidence is missing`);
    for (const phrase of evidence) {
      if (!supplied.includes(normalizeEvidence(phrase))) errors.push(`${kind} evidence is not grounded in supplied text`);
    }
  }
  return errors;
}

function pending(
  deterministic: DeterministicClassification,
  requestedModelId: string | null,
  validationErrors: string[],
): OpenRouterClassification {
  return {
    finalResult: {
      ...deterministic,
      matchTier: 'possible',
      classificationMethod: 'pending',
    },
    modelResult: null,
    requestedModelId,
    actualModelId: null,
    confidence: 0.6,
    validationErrors: validationErrors.slice(0, 10).map((error) => error.slice(0, 300)),
    cacheHit: false,
  };
}

async function setCacheSafely(
  cache: OpenRouterCache | undefined,
  input: OpenRouterInput,
  version: string,
  value: OpenRouterClassification,
) {
  if (!cache) return;
  try {
    await cache.set(input.jobId, input.descriptionHash, version, value);
  } catch (_error) {
    // Cache failure must not affect the scan or classification result.
  }
}

function boundedJobInput(input: OpenRouterInput) {
  return {
    title: input.title.slice(0, 300),
    location: input.location.slice(0, 300),
    jobCategory: input.jobCategory.slice(0, 500),
    experienceText: input.experienceText.slice(0, 1_000),
    description: input.description.slice(0, 12_000),
    deterministic: input.deterministic,
  };
}

function responseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['locationStatus', 'financeStatus', 'experienceStatus', 'minimumYears', 'maximumYears', 'confidence', 'evidence'],
    properties: {
      locationStatus: { type: 'string', enum: ['india', 'not_india', 'uncertain'] },
      financeStatus: { type: 'string', enum: ['exact', 'likely', 'unrelated', 'unclassified'] },
      experienceStatus: { type: 'string', enum: ['zero_to_two', 'ambiguous', 'over_two'] },
      minimumYears: { type: ['number', 'null'], minimum: 0, maximum: 50 },
      maximumYears: { type: ['number', 'null'], minimum: 0, maximum: 50 },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      evidence: {
        type: 'object',
        additionalProperties: false,
        required: ['location', 'finance', 'experience'],
        properties: {
          location: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 200 } },
          finance: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 200 } },
          experience: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 200 } },
        },
      },
    },
  };
}

async function readBoundedText(response: Response, limit: number): Promise<string> {
  const text = await response.text();
  if (text.length > limit) throw new Error(`response exceeded ${limit} bytes`);
  return text;
}

function boundedApiMessage(raw: string): string {
  try {
    const body = JSON.parse(raw);
    const message = isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
      ? body.error.message
      : '';
    return message ? `: ${message.slice(0, 200)}` : '';
  } catch (_error) {
    return '';
  }
}

function statusNeedsEvidence(kind: string, value: ModelClassification): boolean {
  if (kind === 'location') return value.locationStatus !== 'uncertain';
  if (kind === 'finance') return value.financeStatus !== 'unclassified';
  return value.experienceStatus !== 'ambiguous';
}

function evidenceArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 3) return null;
  if (value.some((item) => typeof item !== 'string' || item.length === 0 || item.length > 200)) return null;
  return value as string[];
}

function nullableBoundedNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 50);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

function normalizeEvidence(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
