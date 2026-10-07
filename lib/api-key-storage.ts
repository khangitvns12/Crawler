import { GeminiApiKey, KeyRotationStrategy } from '@/types/novel';

const STORAGE_KEYS_KEY = 'novelflow_gemini_keys';
const STORAGE_STRATEGY_KEY = 'novelflow_key_strategy';
export const GEMINI_KEYS_CHANGED_EVENT = 'novelflow_gemini_keys_changed';

/**
 * Retrieve all configured Gemini API keys from localStorage
 */
export function getStoredApiKeys(): GeminiApiKey[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.warn('Không thể đọc Gemini API Keys từ localStorage:', err);
  }
  return [];
}

/**
 * Save Gemini API keys to localStorage and emit change event
 */
export function saveStoredApiKeys(keys: GeminiApiKey[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS_KEY, JSON.stringify(keys));
    window.dispatchEvent(new CustomEvent(GEMINI_KEYS_CHANGED_EVENT, { detail: keys }));
  } catch (err) {
    console.warn('Không thể lưu Gemini API Keys vào localStorage:', err);
  }
}

/**
 * Get active API key strings for API request payloads
 */
export function getActiveApiKeyStrings(): string[] {
  const keys = getStoredApiKeys();
  return keys
    .filter(k => k.isActive && k.status !== 'invalid')
    .map(k => k.key.trim())
    .filter(Boolean);
}

/**
 * Add a new API key
 */
export function addApiKey(keyText: string, label?: string): GeminiApiKey {
  const cleanKey = keyText.trim();
  const current = getStoredApiKeys();
  
  // Check if key already exists
  const existing = current.find(k => k.key === cleanKey);
  if (existing) {
    return existing;
  }

  const newKey: GeminiApiKey = {
    id: 'key_' + Math.random().toString(36).substring(2, 11),
    key: cleanKey,
    label: label?.trim() || `API Key ${current.length + 1}`,
    isActive: true,
    status: 'untested',
    lastTestedAt: undefined,
  };

  const updated = [newKey, ...current];
  saveStoredApiKeys(updated);
  return newKey;
}

/**
 * Bulk add multiple API keys from a single pasted string (separated by newline, comma, semicolon, space)
 */
export function bulkAddApiKeys(text: string): GeminiApiKey[] {
  const rawList = text
    .split(/[\r\n,;\s]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 20 && (s.startsWith('AIza') || s.length >= 25)); // Gemini keys start with AIza or length >= 25

  const current = getStoredApiKeys();
  const existingKeySet = new Set(current.map(k => k.key));
  const added: GeminiApiKey[] = [];

  for (const key of rawList) {
    if (!existingKeySet.has(key)) {
      existingKeySet.add(key);
      const newKey: GeminiApiKey = {
        id: 'key_' + Math.random().toString(36).substring(2, 11),
        key,
        label: `Key ${current.length + added.length + 1}`,
        isActive: true,
        status: 'untested',
      };
      added.push(newKey);
    }
  }

  if (added.length > 0) {
    saveStoredApiKeys([...added, ...current]);
  }
  return added;
}

/**
 * Delete an API key
 */
export function removeApiKey(id: string): void {
  const current = getStoredApiKeys();
  const filtered = current.filter(k => k.id !== id);
  saveStoredApiKeys(filtered);
}

/**
 * Toggle Active state of an API key
 */
export function toggleApiKeyActive(id: string, active?: boolean): void {
  const current = getStoredApiKeys();
  const updated = current.map(k => {
    if (k.id === id) {
      return { ...k, isActive: active !== undefined ? active : !k.isActive };
    }
    return k;
  });
  saveStoredApiKeys(updated);
}

/**
 * Update key status after verification or runtime error
 */
export function updateApiKeyStatus(
  id: string,
  status: 'active' | 'rate_limited' | 'invalid' | 'untested',
  errorMessage?: string
): void {
  const current = getStoredApiKeys();
  const updated = current.map(k => {
    if (k.id === id) {
      return {
        ...k,
        status,
        lastTestedAt: new Date().toISOString(),
        errorMessage,
      };
    }
    return k;
  });
  saveStoredApiKeys(updated);
}

/**
 * Key rotation strategy
 */
export function getStoredRotationStrategy(): KeyRotationStrategy {
  if (typeof window === 'undefined') return 'round_robin';
  try {
    const val = localStorage.getItem(STORAGE_STRATEGY_KEY);
    if (val === 'failover' || val === 'round_robin') return val;
  } catch {}
  return 'round_robin';
}

export function saveStoredRotationStrategy(strategy: KeyRotationStrategy): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_STRATEGY_KEY, strategy);
  } catch {}
}
