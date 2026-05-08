import type { IngredientTranslation } from '../types';

const cacheKey = 'labelmaker.ingredientTranslations';

export async function translateIngredientQuery(query: string): Promise<IngredientTranslation> {
  const normalized = query.trim();
  if (!normalized) return emptyTranslation();

  const cached = readCache()[normalized];
  if (cached) return cached;

  const response = await fetch('/api/v1/labelmaker/translate-ingredient-query', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ query: normalized }),
  });

  if (!response.ok) {
    const fallback = await response.text();
    throw new Error(fallback || 'Translation service is unavailable.');
  }

  const data = sanitizeTranslation(await response.json());
  writeCache(normalized, data);
  return data;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function emptyTranslation(): IngredientTranslation {
  return { englishTerms: [], displayHint: '', confidence: 0 };
}

function sanitizeTranslation(value: unknown): IngredientTranslation {
  if (!value || typeof value !== 'object') return emptyTranslation();
  const record = value as Partial<IngredientTranslation>;
  return {
    englishTerms: Array.isArray(record.englishTerms)
      ? record.englishTerms.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
      : [],
    displayHint: typeof record.displayHint === 'string' ? record.displayHint : '',
    confidence: typeof record.confidence === 'number' && Number.isFinite(record.confidence) ? record.confidence : 0,
  };
}

function readCache(): Record<string, IngredientTranslation> {
  try {
    return JSON.parse(localStorage.getItem(cacheKey) || '{}') as Record<string, IngredientTranslation>;
  } catch {
    return {};
  }
}

function writeCache(query: string, translation: IngredientTranslation) {
  try {
    const cache = readCache();
    cache[query] = translation;
    localStorage.setItem(cacheKey, JSON.stringify(cache));
  } catch {
    // Cache failure should not block ingredient search.
  }
}
