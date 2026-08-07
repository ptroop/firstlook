(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FirstLookCorpus = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const STORAGE_KEY = 'first-look-outreach-corpus-v1';
  const VALID_RESULTS = new Set(['delivered', 'bounced', 'replied']);
  // Only confirmed delivers/replies prove an address is real, so only they
  // feed pattern learning. Bounces are recorded for history but never learned.
  const LEARNED_RESULTS = new Set(['delivered', 'replied']);
  const MAX_SAMPLES_PER_DOMAIN = 200;

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  let corpus = load();

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(corpus)); } catch (_error) { /* private mode */ }
  }

  function emailParts(email) {
    const value = String(email || '').trim().toLowerCase();
    const at = value.lastIndexOf('@');
    if (at <= 0 || at === value.length - 1) return null;
    return { local: value.slice(0, at), domain: value.slice(at + 1) };
  }

  function nameTokens(name) {
    return String(name || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  // Derive a reusable pattern key from a confirmed name + email pair, e.g.
  // ("Jane Doe", "jane.doe@bank.com") -> "{first}.{last}"
  // ("Jane Doe", "jdoe@bank.com")     -> "{f}{last}"
  // ("Jane Doe", "jane_doe@bank.com") -> "{first}_{last}"
  // Returns null when the local part cannot be aligned with the name — that
  // sample is recorded but never learned from.
  function derivePattern(name, email) {
    const parts = emailParts(email);
    const tokens = nameTokens(name);
    if (!parts || tokens.length < 2) return null;
    // Suffix-style name tokens ("Jr.", "II") are not plain last names.
    if (tokens[tokens.length - 1].includes('.')) return null;
    // Mixed separators ("jane.doe_x") make the pattern unreliable.
    const separators = parts.local.match(/[._-]/g) || [];
    if (new Set(separators).size > 1) return null;
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    const firstInitial = first[0] || '';
    const lastInitial = last[0] || '';
    const localTokens = parts.local.split(/[._-]+/).filter(Boolean);
    if (localTokens.length < 2) {
      const single = localTokens[0] || '';
      if (single === `${firstInitial}${last}`) return '{f}{last}';
      if (single === `${first}${last}`) return '{first}{last}';
      if (single === `${first}${lastInitial}`) return '{first}{l}';
      return null;
    }
    const head = localTokens[0];
    const tail = localTokens[localTokens.length - 1];
    const headOk = head === first || head === firstInitial;
    const tailOk = tail === last || tail === lastInitial;
    if (!headOk || !tailOk) return null;
    const separator = parts.local.match(/[._-]/)?.[0] || '.';
    const middle = localTokens.length > 2 ? localTokens.slice(1, -1).join(separator) : '';
    const headKey = head === first ? '{first}' : '{f}';
    const tailKey = tail === last ? '{last}' : '{l}';
    return [headKey, ...(middle ? [middle] : []), tailKey].join(separator);
  }

  function recordResult({ name, email, result }) {
    const parts = emailParts(email);
    if (!parts || !VALID_RESULTS.has(result)) return null;
    const entry = corpus[parts.domain] || { patterns: {}, samples: [] };
    const pattern = derivePattern(name, email);
    if (pattern && LEARNED_RESULTS.has(result)) {
      entry.patterns[pattern] = (entry.patterns[pattern] || 0) + 1;
    }
    entry.samples = [
      ...entry.samples,
      {
        email: `${parts.local}@${parts.domain}`.slice(0, 254),
        name: String(name || '').trim().slice(0, 120),
        result,
        at: new Date().toISOString(),
      },
    ].slice(-MAX_SAMPLES_PER_DOMAIN);
    corpus[parts.domain] = entry;
    persist();
    return { domain: parts.domain, pattern, samples: entry.samples.length };
  }

  function bestPattern(domain) {
    const entry = corpus[String(domain || '').trim().toLowerCase()];
    if (!entry || !entry.patterns) return null;
    const learned = Object.entries(entry.patterns).sort((left, right) => right[1] - left[1]);
    if (!learned.length) return null;
    const [pattern, count] = learned[0];
    const total = learned.reduce((sum, [, value]) => sum + value, 0);
    return { pattern, count, confidence: Math.round((count / total) * 100) };
  }

  // Zero-sample ban: no confirmed send on the domain -> no suggestion, ever.
  function suggest(domain, firstName, lastName) {
    const best = bestPattern(domain);
    if (!best) return null;
    const first = String(firstName || '').trim().toLowerCase();
    const last = String(lastName || '').trim().toLowerCase();
    if (!first || !last) return null;
    const email = best.pattern
      .replace('{first}', first)
      .replace('{last}', last)
      .replace('{f}', first[0] || '')
      .replace('{l}', last[0] || '');
    return {
      email: `${email}@${String(domain).trim().toLowerCase()}`,
      pattern: best.pattern,
      sampleCount: best.count,
      confidence: best.confidence,
    };
  }

  function stats() {
    return Object.entries(corpus).map(([domain, entry]) => ({
      domain,
      patterns: entry.patterns || {},
      samples: (entry.samples || []).length,
    }));
  }

  function clear() {
    corpus = {};
    persist();
  }

  return { recordResult, suggest, bestPattern, stats, clear };
});
