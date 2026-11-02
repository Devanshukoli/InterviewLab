import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function installStorageMock() {
  const store: Record<string, string> = {};
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((key) => delete store[key]);
    },
    key: () => null,
    length: 0,
  };
  return store;
}

describe('cookie consent storage', () => {
  beforeEach(() => {
    installStorageMock();
  });

  it('returns null when no choice was saved', async () => {
    const { getStoredCookieConsent, hasCookieConsentDecision } = await import('./cookie-consent.ts');
    assert.equal(getStoredCookieConsent(), null);
    assert.equal(hasCookieConsentDecision(), false);
  });

  it('persists accepted and declined choices', async () => {
    const store = installStorageMock();
    const { setCookieConsent, getStoredCookieConsent, hasCookieConsentDecision } = await import(
      './cookie-consent.ts'
    );

    setCookieConsent('accepted');
    assert.equal(store.cookie_consent, 'accepted');
    assert.equal(getStoredCookieConsent(), 'accepted');
    assert.equal(hasCookieConsentDecision(), true);

    setCookieConsent('declined');
    assert.equal(getStoredCookieConsent(), 'declined');
  });

  it('ignores invalid stored values', async () => {
    const store = installStorageMock();
    store.cookie_consent = 'maybe';
    const { getStoredCookieConsent } = await import('./cookie-consent.ts');
    assert.equal(getStoredCookieConsent(), null);
  });
});
