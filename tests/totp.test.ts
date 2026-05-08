/**
 * Tests for the otp-ninja TOTP provider.
 */

import { generateTOTP, verifyTOTP } from '../src/providers/totp/totp.js';
import { OTPInvalidConfigError } from '../src/core/errors.js';

const VALID_SECRET = 'JBSWY3DPEHPK3PXP';

describe('generateTOTP', () => {
  it('returns a 6-digit string by default', () => {
    const { otp } = generateTOTP({ secret: VALID_SECRET });
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('returns correct number of digits when digits option set', () => {
    const { otp } = generateTOTP({ secret: VALID_SECRET, digits: 8 });
    expect(otp).toHaveLength(8);
    expect(otp).toMatch(/^\d{8}$/);
  });

  it('pads with leading zeros when necessary', () => {
    // OTP values near 0 should be padded — we check format, not specific value
    const { otp } = generateTOTP({ secret: VALID_SECRET });
    expect(otp.length).toBe(6);
  });

  it('returns remainingSeconds between 1 and period', () => {
    const { remainingSeconds, period } = generateTOTP({ secret: VALID_SECRET });
    expect(remainingSeconds).toBeGreaterThanOrEqual(1);
    expect(remainingSeconds).toBeLessThanOrEqual(period);
  });

  it('isExpiring is true when remainingSeconds <= 5', () => {
    const { isExpiring, remainingSeconds } = generateTOTP({ secret: VALID_SECRET });
    if (remainingSeconds <= 5) {
      expect(isExpiring).toBe(true);
    } else {
      expect(isExpiring).toBe(false);
    }
  });

  it('returns provider as "totp"', () => {
    const { provider } = generateTOTP({ secret: VALID_SECRET });
    expect(provider).toBe('totp');
  });

  it('throws OTPInvalidConfigError for missing secret', () => {
    expect(() => generateTOTP({ secret: '' })).toThrow(OTPInvalidConfigError);
  });

  it('throws OTPInvalidConfigError for invalid Base32 secret', () => {
    expect(() => generateTOTP({ secret: 'INVALID!!!SECRET' })).toThrow(OTPInvalidConfigError);
  });

  it('works with SHA256 algorithm', () => {
    const { otp } = generateTOTP({ secret: VALID_SECRET, algorithm: 'SHA256' });
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('works with SHA512 algorithm', () => {
    const { otp } = generateTOTP({ secret: VALID_SECRET, algorithm: 'SHA512' });
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('works with custom period', () => {
    const { otp, period } = generateTOTP({ secret: VALID_SECRET, period: 60 });
    expect(otp).toMatch(/^\d{6}$/);
    expect(period).toBe(60);
  });
});

describe('verifyTOTP', () => {
  it('returns true for the current valid token', () => {
    const { otp } = generateTOTP({ secret: VALID_SECRET });
    expect(verifyTOTP(otp, { secret: VALID_SECRET })).toBe(true);
  });

  it('returns false for an obviously wrong token', () => {
    expect(verifyTOTP('000000', { secret: VALID_SECRET })).toBe(false);
  });

  it('returns false for invalid config (never throws)', () => {
    expect(verifyTOTP('123456', { secret: '' })).toBe(false);
  });

  it('returns false for a token from a different secret', () => {
    const { otp } = generateTOTP({ secret: VALID_SECRET });
    expect(verifyTOTP(otp, { secret: 'AAAAAAAAAAAAAAAA' })).toBe(false);
  });
});
