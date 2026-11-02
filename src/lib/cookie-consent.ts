export const COOKIE_CONSENT_STORAGE_KEY = 'cookie_consent';

export type CookieConsentChoice = 'accepted' | 'declined';

export function parseCookieConsent(value: string | null): CookieConsentChoice | null {
  if (value === 'accepted' || value === 'declined') {
    return value;
  }
  return null;
}

export function getStoredCookieConsent(): CookieConsentChoice | null {
  try {
    return parseCookieConsent(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function setCookieConsent(choice: CookieConsentChoice): void {
  try {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, choice);
  } catch {
    /* ignore quota / private mode */
  }
}

export function hasCookieConsentDecision(): boolean {
  return getStoredCookieConsent() !== null;
}
