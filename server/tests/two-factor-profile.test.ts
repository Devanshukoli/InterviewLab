import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from '../api/auth/auth.service';
import { TotpService } from '../services/totp';

describe('2FA profile mapping', () => {
  it('reads pending_two_factor_secret so verify can finish after setup', () => {
    const user = AuthService.profileRowToUser({
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      email: 'architect@interviewops.io',
      name: 'Architect',
      two_factor_enabled: false,
      two_factor_secret: null,
      pending_two_factor_secret: 'ABCDEFGHIJKLMNOP',
      backup_codes: [],
    });

    assert.equal(user.pendingTwoFactorSecret, 'ABCDEFGHIJKLMNOP');
    assert.equal(user.twoFactorEnabled, false);
    assert.equal(TotpService.verifyToken('000000', user.pendingTwoFactorSecret!), false);
  });
});
