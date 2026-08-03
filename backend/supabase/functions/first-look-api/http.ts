export async function readJsonBody(response: Response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function parseScanRequest(url: URL): { group: string; runType: 'watch' | 'reconcile' | 'hydrate' } {
  const group = url.searchParams.get('group') ?? '';
  const runType = url.searchParams.get('run_type') ?? '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(group) || group.length > 80) throw new Error('Invalid group');
  if (!['watch', 'reconcile', 'hydrate'].includes(runType)) throw new Error('Invalid run type');
  return { group, runType: runType as 'watch' | 'reconcile' | 'hydrate' };
}

export function safePublicError(_error: unknown): { error: 'Internal error' } {
  return { error: 'Internal error' };
}
