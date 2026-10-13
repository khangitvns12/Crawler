'use client';

import { useSyncExternalStore } from 'react';
import { getActiveApiKeyStrings, GEMINI_KEYS_CHANGED_EVENT } from './api-key-storage';

const emptySubscribe = () => () => {};

/**
 * Hook to retrieve window.location.origin with zero hydration mismatch and zero cascading render.
 */
export function useWindowOrigin(): string {
  return useSyncExternalStore(
    emptySubscribe,
    () => (typeof window !== 'undefined' ? window.location.origin : ''),
    () => ''
  );
}

function subscribeKeys(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(GEMINI_KEYS_CHANGED_EVENT, callback);
  return () => window.removeEventListener(GEMINI_KEYS_CHANGED_EVENT, callback);
}

/**
 * Hook to retrieve active Gemini API keys count synchronized with local store and server SSR.
 */
export function useActiveKeysCount(): number {
  return useSyncExternalStore(
    subscribeKeys,
    () => (typeof window !== 'undefined' ? getActiveApiKeyStrings().length : 0),
    () => 0
  );
}
