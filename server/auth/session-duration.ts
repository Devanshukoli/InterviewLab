/** Sliding session window for refresh tokens and auth cookies (40 days). */
export const REFRESH_TOKEN_TTL_DAYS = 40;

export const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

/** `jsonwebtoken` `expiresIn` value matching `REFRESH_TOKEN_TTL_MS`. */
export const REFRESH_TOKEN_JWT_EXPIRES_IN = `${REFRESH_TOKEN_TTL_DAYS}d` as const;

export function refreshTokenExpiresAt(fromMs: number = Date.now()): number {
  return fromMs + REFRESH_TOKEN_TTL_MS;
}