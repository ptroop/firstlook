export const RESUME_BUCKET = 'resume-intake';
export const RESUME_MAX_BYTES = 10 * 1024 * 1024;
export const RESUME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
};

export type ResumeStorageObject = {
  name?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  metadata?: unknown;
};

export type ResumeMetadata = {
  path: string;
  name: string;
  createdAt: string | null;
  contentType: string | null;
  size: number | null;
};

export function isOwnerEmail(userEmail: string, configuredOwnerEmail: string): boolean {
  const user = String(userEmail || '').trim().toLowerCase();
  const owner = String(configuredOwnerEmail || '').trim().toLowerCase();
  return Boolean(user && owner && user === owner);
}

export function resumeFileType(filename: string): string | null {
  const extension = String(filename || '').toLowerCase().split('.').pop() || '';
  return RESUME_TYPES[extension] || null;
}

export function resumeStoragePath(path: string): string | null {
  let decoded = String(path || '').trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch (_error) {
    return null;
  }
  if (!/^resume-intake\/[a-zA-Z0-9._ -]+$/.test(decoded)) return null;
  if (decoded.includes('..') || decoded.includes('\\') || /[\u0000-\u001f]/.test(decoded)) return null;
  return decoded;
}

export function resumeSafeName(path: string): string {
  const validPath = resumeStoragePath(path);
  if (!validPath) return 'resume';
  const raw = validPath.split('/').pop() || 'resume';
  return raw
    .replace(/^\d+-[0-9a-f-]{36}-/i, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .slice(0, 120) || 'resume';
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function metadataString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    if (typeof record[key] === 'string' && record[key]) return record[key] as string;
  }
  return null;
}

function metadataSize(record: Record<string, unknown>): number | null {
  for (const key of ['size', 'contentLength']) {
    const value = Number(record[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

export function resumeMetadata(object: ResumeStorageObject): ResumeMetadata | null {
  const rawName = typeof object?.name === 'string' ? object.name : '';
  const path = resumeStoragePath(rawName.startsWith(`${RESUME_BUCKET}/`) ? rawName : `${RESUME_BUCKET}/${rawName}`);
  if (!path) return null;
  const metadata = metadataRecord(object.metadata);
  return {
    path,
    name: resumeSafeName(path),
    createdAt: metadataString(object, 'created_at', 'updated_at'),
    contentType: metadataString(metadata, 'mimetype', 'contentType', 'content-type'),
    size: metadataSize(metadata),
  };
}
