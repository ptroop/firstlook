(function () {
  const STORAGE_KEY = 'first-look-application-kits-v1';
  const STATUS_VALUES = ['shortlisted', 'preparing', 'applied', 'follow_up', 'interview', 'closed'];

  function text(value, limit = 4000) {
    return String(value || '').trim().slice(0, limit);
  }

  function jobSnapshot(job) {
    return {
      id: text(job?.id || `${job?.company || ''}|${job?.title || ''}|${job?.location || ''}`, 180),
      company: text(job?.company, 120),
      title: text(job?.title, 180),
      location: text(job?.location, 120),
      officialDetailUrl: text(job?.officialDetailUrl, 500),
      officialApplyUrl: text(job?.officialApplyUrl, 500),
      applyUrl: text(job?.applyUrl, 500),
      officialVerified: Boolean(job?.officialVerified),
    };
  }

  function confidence(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : null;
  }

  function followUp(value, index) {
    return {
      id: text(value?.id || `follow-${index}-${Date.now()}`, 60),
      at: text(value?.at, 10),
      note: text(value?.note, 1000),
      sent: Boolean(value?.sent),
    };
  }

  function normalize(record) {
    if (!record || typeof record !== 'object' || !record.job?.id) return null;
    const now = new Date().toISOString();
    return {
      id: text(record.id || record.job.id, 180),
      job: jobSnapshot(record.job),
      status: STATUS_VALUES.includes(record.status) ? record.status : 'shortlisted',
      notes: text(record.notes, 4000),
      answers: text(record.answers, 10000),
      outreachDraft: text(record.outreachDraft, 6000),
      outreachDraftReviewed: Boolean(record.outreachDraftReviewed),
      outreachSentAt: text(record.outreachSentAt, 40),
      outreachResult: ['delivered', 'bounced', 'replied'].includes(record.outreachResult) ? record.outreachResult : '',
      followUps: Array.isArray(record.followUps) ? record.followUps.slice(0, 6).map(followUp) : [],
      contact: {
        name: text(record.contact?.name, 160),
        title: text(record.contact?.title, 180),
        type: ['recruiter', 'referral', 'alumni', 'other'].includes(record.contact?.type) ? record.contact.type : 'recruiter',
        linkedinUrl: text(record.contact?.linkedinUrl, 500),
        email: text(record.contact?.email, 240),
        emailSource: text(record.contact?.emailSource, 500),
        emailConfidence: confidence(record.contact?.emailConfidence),
        emailVerified: Boolean(record.contact?.emailVerified),
        lookupAt: text(record.contact?.lookupAt, 40),
        sourceUrl: text(record.contact?.sourceUrl, 500),
        verifiedEmail: text(record.contact?.verifiedEmail, 240),
        verificationStatus: text(record.contact?.verificationStatus, 40),
        verificationLabel: text(record.contact?.verificationLabel, 160),
        verificationProvider: text(record.contact?.verificationProvider, 60),
        verificationCheckedAt: text(record.contact?.verificationCheckedAt, 40),
      },
      createdAt: text(record.createdAt, 40) || now,
      updatedAt: text(record.updatedAt, 40) || now,
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

  let records = load();

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function get(id) {
    return records.find((record) => record.id === String(id)) || null;
  }

  function upsert(job, patch = {}) {
    const id = jobSnapshot(job).id;
    const existing = get(id);
    const now = new Date().toISOString();
    const next = normalize({
      ...(existing || {}),
      ...patch,
      id,
      job: jobSnapshot(job),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    records = [next, ...records.filter((record) => record.id !== id)];
    persist();
    return next;
  }

  function all() {
    return [...records];
  }

  function remove(id) {
    records = records.filter((record) => record.id !== String(id));
    persist();
  }

  function exportPayload(record, extra = {}) {
    const normalized = normalize(record);
    if (!normalized) return null;
    return {
      type: 'first-look-application-kit',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      job: normalized.job,
      status: normalized.status,
      notes: normalized.notes,
      answers: normalized.answers,
      contact: normalized.contact,
      outreach: {
        draft: normalized.outreachDraft,
        draftReviewed: normalized.outreachDraftReviewed,
        sentAt: normalized.outreachSentAt,
        result: normalized.outreachResult,
      },
      followUps: normalized.followUps,
      verification: normalized.contact.verifiedEmail && normalized.contact.verificationStatus
        ? {
            email: normalized.contact.verifiedEmail,
            status: normalized.contact.verificationStatus,
            label: normalized.contact.verificationLabel,
            provider: normalized.contact.verificationProvider,
            checkedAt: normalized.contact.verificationCheckedAt,
          }
        : null,
      ...extra,
    };
  }

  window.FirstLookApplicationKit = { all, get, upsert, remove, exportPayload, statuses: STATUS_VALUES };
}());
