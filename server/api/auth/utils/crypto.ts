import crypto from 'crypto';
import { logger } from '../../../observability';

/**
 * Encrypts a string (e.g. an API Key) using AES-256-CBC.
 */
export function encrypt(text: string): string {
  if (!text) return '';
  const secret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET || 'interviewops-default-jwt-secret-key-2026-safe-fallback';
  const key = crypto.createHash('sha256').update(secret).digest(); // Ensures 32 bytes key
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a string (e.g. an API Key) using AES-256-CBC.
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';
  const parts = encryptedText.split(':');
  if (parts.length !== 2) return encryptedText; // Fallback to raw string if not matching encrypted format
  try {
    const [ivHex, encryptedHex] = parts;
    const secret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET || 'interviewops-default-jwt-secret-key-2026-safe-fallback';
    const key = crypto.createHash('sha256').update(secret).digest();
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    logger.error('❌ Failed to decrypt value, returning raw string as fallback:', error);
    return encryptedText;
  }
}

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

