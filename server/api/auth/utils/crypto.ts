import crypto from 'crypto';

/**
 * Hashes a plain text password using scrypt with a random 16-byte salt.
 * Format: "salt:hash"
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plain text password against a stored scrypt hash ("salt:hash").
 * Rejects encrypted strings or legacy non-hash formats.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || storedHash.startsWith('enc:')) {
    return false;
  }

  const parts = storedHash.split(':');
  if (parts.length !== 2) {
    return false;
  }

  const [salt, keyHex] = parts;
  if (!salt || !keyHex) {
    return false;
  }

  try {
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(keyHex, 'hex');
    if (derivedKey.length !== keyBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(derivedKey, keyBuffer);
  } catch {
    return false;
  }
}

