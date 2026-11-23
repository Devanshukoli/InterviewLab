import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REFRESH_TOKEN_JWT_EXPIRES_IN,
  REFRESH_TOKEN_TTL_DAYS,
  REFRESH_TOKEN_TTL_MS,
  refreshTokenExpiresAt,
} from './session-duration';

describe('session duration', () => {
  it('uses a 40-day refresh window', () => {
    assert.equal(REFRESH_TOKEN_TTL_DAYS, 40);
    assert.equal(REFRESH_TOKEN_TTL_MS, 40 * 24 * 60 * 60 * 1000);
    assert.equal(REFRESH_TOKEN_JWT_EXPIRES_IN, '40d');
  });

  it('computes expiry from a timestamp', () => {
    const base = 1_700_000_000_000;
    assert.equal(refreshTokenExpiresAt(base), base + REFRESH_TOKEN_TTL_MS);
  });
});