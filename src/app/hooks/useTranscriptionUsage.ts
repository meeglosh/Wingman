import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY      = 'wingman_transcription_seconds';
const ENTITLEMENT_KEY  = 'wingman_entitlement';

export const FREE_LIMIT_MINUTES = 15;
export const CREDITS_SECONDS    = 120 * 60; // 120 min top-up
const FREE_LIMIT_SECONDS = FREE_LIMIT_MINUTES * 60;

export type Entitlement =
  | { type: 'credits';      grantedSeconds: number; purchasedAt: number }
  | { type: 'subscription'; purchasedAt: number };

function readSeconds(): number {
  return parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10) || 0;
}

function readEntitlement(): Entitlement | null {
  try {
    const raw = localStorage.getItem(ENTITLEMENT_KEY);
    return raw ? (JSON.parse(raw) as Entitlement) : null;
  } catch { return null; }
}

export function useTranscriptionUsage() {
  const [secondsUsed,  setSecondsUsed]  = useState<number>(readSeconds);
  const [entitlement,  setEntitlement]  = useState<Entitlement | null>(readEntitlement);

  // Re-read entitlement when the tab regains focus (e.g. after Stripe redirect)
  useEffect(() => {
    const onFocus = () => setEntitlement(readEntitlement());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const totalAllowedSeconds = (() => {
    if (!entitlement)                     return FREE_LIMIT_SECONDS;
    if (entitlement.type === 'subscription') return Infinity;
    return FREE_LIMIT_SECONDS + entitlement.grantedSeconds;
  })();

  const hasHitLimit  = secondsUsed >= totalAllowedSeconds;
  const minutesUsed  = secondsUsed / 60;

  const addSeconds = useCallback((n: number) => {
    setSecondsUsed(prev => {
      const next = prev + n;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const resetUsage = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSecondsUsed(0);
  }, []);

  const refreshEntitlement = useCallback(() => {
    setEntitlement(readEntitlement());
  }, []);

  return {
    secondsUsed,
    minutesUsed,
    hasHitLimit,
    addSeconds,
    resetUsage,
    entitlement,
    refreshEntitlement,
    FREE_LIMIT_MINUTES,
    CREDITS_SECONDS,
  };
}

// Called by PaymentSuccess to persist the entitlement grant
export function storeEntitlement(e: Entitlement) {
  localStorage.setItem(ENTITLEMENT_KEY, JSON.stringify(e));
}
