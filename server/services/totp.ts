import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export class TotpService {
  /**
   * Generate a random 16-character base32 TOTP secret key
   */
  static generateSecret(length = 16): string {
    const randomBytes = crypto.randomBytes(length);
    let secret = '';
    for (let i = 0; i < randomBytes.length; i++) {
      secret += BASE32_ALPHABET[randomBytes[i] % 32];
    }
    return secret;
  }

  /**
   * Decode base32 string to Buffer
   */
  private static base32ToBuffer(base32: string): Buffer {
    const cleaned = base32.toUpperCase().replace(/=/g, '').replace(/[^A-Z2-7]/g, '');
    let bits = '';
    for (let i = 0; i < cleaned.length; i++) {
      const val = BASE32_ALPHABET.indexOf(cleaned[i]);
      bits += val.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.substr(i, 8), 2));
    }
    return Buffer.from(bytes);
  }

  /**
   * Generate 6-digit TOTP code for a given secret at specific time window
   */
  static generateCode(secret: string, timeStepWindow?: number): string {
    const secretBuf = this.base32ToBuffer(secret);
    const window = timeStepWindow ?? Math.floor(Date.now() / 1000 / 30);

    const timeBuf = Buffer.alloc(8);
    timeBuf.writeBigInt64BE(BigInt(window), 0);

    const hmac = crypto.createHmac('sha1', secretBuf).update(timeBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;

    const codeInt =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const code = codeInt % 1000000;
    return code.toString().padStart(6, '0');
  }

  /**
   * Verify a 6-digit TOTP code against a secret with window tolerance (+/- 1 time step)
   */
  static verifyToken(token: string, secret: string, windowTolerance = 1): boolean {
    if (!token || token.length !== 6 || !/^\d{6}$/.test(token)) {
      return false;
    }
    const currentWindow = Math.floor(Date.now() / 1000 / 30);
    for (let i = -windowTolerance; i <= windowTolerance; i++) {
      const generated = this.generateCode(secret, currentWindow + i);
      if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(generated))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Generate otpauth URI for QR codes
   */
  static getOtpAuthUri(secret: string, accountName: string, issuer = 'InterviewLab'): string {
    const label = encodeURIComponent(`${issuer}:${accountName}`);
    const encodedIssuer = encodeURIComponent(issuer);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
  }

  /**
   * Generate 8 single-use recovery / backup codes (format: XXXX-XXXX)
   */
  static generateBackupCodes(count = 8): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const hex = crypto.randomBytes(4).toString('hex').toLowerCase();
      codes.push(`${hex.substring(0, 4)}-${hex.substring(4, 8)}`);
    }
    return codes;
  }
}
