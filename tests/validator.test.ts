/**
 * Tests for the otp-ninja configuration validators.
 */

import {
  validateEmailConfig,
  validateTwilioConfig,
  validateVonageConfig,
  validateTOTPConfig,
} from '../src/core/validator.js';
import { OTPInvalidConfigError } from '../src/core/errors.js';

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

describe('validateEmailConfig', () => {
  const valid = {
    host: 'imap.gmail.com',
    user: 'qa@example.com',
    password: 'app-password',
  };

  it('passes for valid config', () => {
    expect(() => validateEmailConfig(valid)).not.toThrow();
  });

  it('throws when host is missing', () => {
    expect(() => validateEmailConfig({ ...valid, host: undefined }))
      .toThrow(OTPInvalidConfigError);
  });

  it('throws when user is missing', () => {
    expect(() => validateEmailConfig({ ...valid, user: undefined }))
      .toThrow(OTPInvalidConfigError);
  });

  it('throws when password is missing', () => {
    expect(() => validateEmailConfig({ ...valid, password: undefined }))
      .toThrow(OTPInvalidConfigError);
  });

  it('throws when user is not an email address', () => {
    expect(() => validateEmailConfig({ ...valid, user: 'notanemail' }))
      .toThrow(OTPInvalidConfigError);
  });

  it('throws when from is set to own email (common mistake)', () => {
    expect(() => validateEmailConfig({ ...valid, from: valid.user }))
      .toThrow(OTPInvalidConfigError);
  });

  it('does not throw when from is a different address', () => {
    expect(() => validateEmailConfig({ ...valid, from: 'no-reply@app.com' }))
      .not.toThrow();
  });

  it('throws when timeout is below 5000ms', () => {
    expect(() => validateEmailConfig({ ...valid, timeout: 1000 }))
      .toThrow(OTPInvalidConfigError);
  });

  it('throws when port is invalid', () => {
    expect(() => validateEmailConfig({ ...valid, port: 99999 }))
      .toThrow(OTPInvalidConfigError);
  });

  it('throws when tls is not a boolean', () => {
    expect(() => validateEmailConfig({ ...valid, tls: 'yes' }))
      .toThrow(OTPInvalidConfigError);
  });

  it('invalidFields contains the field name', () => {
    try {
      validateEmailConfig({ ...valid, host: undefined });
    } catch (err) {
      expect(err).toBeInstanceOf(OTPInvalidConfigError);
      expect((err as OTPInvalidConfigError).invalidFields).toContain('host');
    }
  });
});

// ---------------------------------------------------------------------------
// Twilio validation
// ---------------------------------------------------------------------------

describe('validateTwilioConfig', () => {
  const valid = {
    accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    authToken: 'abc123',
    to: '+14155552671',
  };

  it('passes for valid config', () => {
    expect(() => validateTwilioConfig(valid)).not.toThrow();
  });

  it('throws when accountSid is missing', () => {
    expect(() => validateTwilioConfig({ ...valid, accountSid: undefined }))
      .toThrow(OTPInvalidConfigError);
  });

  it('throws when accountSid does not start with AC', () => {
    expect(() => validateTwilioConfig({ ...valid, accountSid: 'BADxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }))
      .toThrow(OTPInvalidConfigError);
  });

  it('throws when authToken is missing', () => {
    expect(() => validateTwilioConfig({ ...valid, authToken: undefined }))
      .toThrow(OTPInvalidConfigError);
  });

  it('throws when to is missing', () => {
    expect(() => validateTwilioConfig({ ...valid, to: undefined }))
      .toThrow(OTPInvalidConfigError);
  });
});

// ---------------------------------------------------------------------------
// Vonage validation
// ---------------------------------------------------------------------------

describe('validateVonageConfig', () => {
  const valid = { apiKey: 'key123', apiSecret: 'secret456', to: '+14155552671' };

  it('passes for valid config', () => {
    expect(() => validateVonageConfig(valid)).not.toThrow();
  });

  it('throws when apiKey is missing', () => {
    expect(() => validateVonageConfig({ ...valid, apiKey: undefined }))
      .toThrow(OTPInvalidConfigError);
  });

  it('throws when apiSecret is missing', () => {
    expect(() => validateVonageConfig({ ...valid, apiSecret: undefined }))
      .toThrow(OTPInvalidConfigError);
  });
});

// ---------------------------------------------------------------------------
// TOTP validation
// ---------------------------------------------------------------------------

describe('validateTOTPConfig', () => {
  const valid = { secret: 'JBSWY3DPEHPK3PXP' };

  it('passes for valid Base32 secret', () => {
    expect(() => validateTOTPConfig(valid)).not.toThrow();
  });

  it('throws when secret is missing', () => {
    expect(() => validateTOTPConfig({ secret: undefined }))
      .toThrow(OTPInvalidConfigError);
  });

  it('throws when secret contains invalid Base32 characters', () => {
    expect(() => validateTOTPConfig({ secret: 'INVALID-SECRET-!!!' }))
      .toThrow(OTPInvalidConfigError);
  });

  it('throws when secret is too short', () => {
    expect(() => validateTOTPConfig({ secret: 'ABCD' }))
      .toThrow(OTPInvalidConfigError);
  });

  it('throws when digits is out of range', () => {
    expect(() => validateTOTPConfig({ ...valid, digits: 3 }))
      .toThrow(OTPInvalidConfigError);
    expect(() => validateTOTPConfig({ ...valid, digits: 11 }))
      .toThrow(OTPInvalidConfigError);
  });

  it('throws when period is out of range', () => {
    expect(() => validateTOTPConfig({ ...valid, period: 5 }))
      .toThrow(OTPInvalidConfigError);
  });

  it('throws when algorithm is invalid', () => {
    expect(() => validateTOTPConfig({ ...valid, algorithm: 'MD5' }))
      .toThrow(OTPInvalidConfigError);
  });

  it('passes for SHA256 and SHA512', () => {
    expect(() => validateTOTPConfig({ ...valid, algorithm: 'SHA256' })).not.toThrow();
    expect(() => validateTOTPConfig({ ...valid, algorithm: 'SHA512' })).not.toThrow();
  });
});
