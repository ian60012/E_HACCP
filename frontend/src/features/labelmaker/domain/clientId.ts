let fallbackCounter = 0;

export function createClientId(prefix = 'id'): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;

  fallbackCounter = (fallbackCounter + 1) % Number.MAX_SAFE_INTEGER;
  const timestamp = Date.now().toString(36);
  const counter = fallbackCounter.toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${timestamp}-${counter}-${random}`;
}
