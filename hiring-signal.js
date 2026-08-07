(function () {
  const STORAGE_KEY = 'first-look-hiring-signals-v1';
  const SOURCE_TYPES = ['linkedin', 'x', 'website', 'other'];

  function text(value, limit = 1000) {
    return String(value || '').trim().slice(0, limit);
  }

  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16);
  }

  function normalize(value) {
    if (!value || typeof value !== 'object') return null;
    const postUrl = String(value.postUrl || '').trim().slice(0, 500);
    if (!/^https:\/\//.test(postUrl)) return null;
    const company = text(value.company, 120);
    if (!company) return null;
    return {
      id: text(value.id || `signal_${hash(postUrl)}`, 80),
      sourceType: SOURCE_TYPES.includes(value.sourceType) ? value.sourceType : 'other',
      postUrl,
      company,
      title: text(value.title, 180),
      postedAt: text(value.postedAt, 40),
      contactName: text(value.contactName, 160),
      contactEmail: text(value.contactEmail, 240),
      note: text(value.note, 2000),
      capturedAt: text(value.capturedAt, 40) || new Date().toISOString(),
    };
  }

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.map(normalize).filter(Boolean) : [];
    } catch (_error) {
      return [];
    }
  }

  let signals = load();

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(signals));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function add(value) {
    const normalized = normalize(value);
    if (!normalized) return null;
    signals = [normalized, ...signals.filter((signal) => signal.id !== normalized.id)];
    persist();
    return normalized;
  }

  function remove(id) {
    signals = signals.filter((signal) => signal.id !== String(id));
    persist();
  }

  function get(id) {
    return signals.find((signal) => signal.id === String(id)) || null;
  }

  function all() {
    return [...signals];
  }

  window.FirstLookHiringSignals = { add, remove, get, all };
}());
