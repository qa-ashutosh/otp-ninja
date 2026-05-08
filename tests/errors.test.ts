/**
 * Tests for the otp-ninja error handling system.
 */

import {
  OTPNinjaError,
  OTPNotFoundError,
  OTPTimeoutError,
  OTPConnectionError,
  OTPAuthenticationError,
  OTPInvalidConfigError,
  OTPExtractionError,
  OTPMissingDependencyError,
  OTPProviderError,
  OTPErrorFactory,
  isOTPError,
  isOTPErrorCode,
  maskSensitive,
  maskEmail,
  maskPhone,
} from '../src/core/errors.js';

// ---------------------------------------------------------------------------
// maskSensitive
// ---------------------------------------------------------------------------

describe('maskSensitive', () => {
  it('masks password fields', () => {
    const result = maskSensitive({ host: 'imap.gmail.com', password: 'secret123' }) as Record<string, unknown>;
    expect(result.host).toBe('imap.gmail.com');
    expect(result.password).toBe('***');
  });

  it('masks token, apiKey, authToken fields', () => {
    const result = maskSensitive({ apiKey: 'key123', authToken: 'tok456', token: 'tok789' }) as Record<string, unknown>;
    expect(result.apiKey).toBe('***');
    expect(result.authToken).toBe('***');
    expect(result.token).toBe('***');
  });

  it('passes through non-sensitive fields unchanged', () => {
    const result = maskSensitive({ host: 'imap.gmail.com', port: 993 }) as Record<string, unknown>;
    expect(result.host).toBe('imap.gmail.com');
    expect(result.port).toBe(993);
  });

  it('handles nested objects', () => {
    const result = maskSensitive({ auth: { password: 'secret', user: 'me' } }) as Record<string, unknown>;
    const auth = result.auth as Record<string, unknown>;
    expect(auth.password).toBe('***');
    expect(auth.user).toBe('me');
  });

  it('handles null and undefined gracefully', () => {
    expect(maskSensitive(null)).toBeNull();
    expect(maskSensitive(undefined)).toBeUndefined();
  });

  it('handles arrays', () => {
    const result = maskSensitive([{ password: 'x' }, { user: 'y' }]) as Array<Record<string, unknown>>;
    expect((result[0] as Record<string, unknown>).password).toBe('***');
    expect((result[1] as Record<string, unknown>).user).toBe('y');
  });
});

describe('maskEmail', () => {
  it('masks the local part', () => {
    expect(maskEmail('john.doe@gmail.com')).toBe('***@gmail.com');
  });

  it('returns *** for strings without @', () => {
    expect(maskEmail('notanemail')).toBe('***');
  });
});

describe('maskPhone', () => {
  it('keeps last 4 digits', () => {
    expect(maskPhone('+14155552671')).toBe('***2671');
  });

  it('strips non-digits before masking', () => {
    expect(maskPhone('(415) 555-2671')).toBe('***2671');
  });
});

// ---------------------------------------------------------------------------
// OTPNinjaError base class
// ---------------------------------------------------------------------------

describe('OTPNinjaError', () => {
  const err = OTPErrorFactory.timeout({
    provider: 'email',
    timeoutMs: 30_000,
    attemptsMade: 10,
    elapsedMs: 30012,
  });

  it('is an instance of Error', () => {
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of OTPNinjaError', () => {
    expect(err).toBeInstanceOf(OTPNinjaError);
  });

  it('has the correct code', () => {
    expect(err.code).toBe('TIMEOUT');
  });

  it('has the correct provider', () => {
    expect(err.provider).toBe('email');
  });

  it('isRetryable is true for retryable severity', () => {
    expect(err.isRetryable).toBe(true);
  });

  it('isUserError is false for retryable severity', () => {
    expect(err.isUserError).toBe(false);
  });

  it('toDiagnosticString contains key fields', () => {
    const str = err.toDiagnosticString();
    expect(str).toContain('TIMEOUT');
    expect(str).toContain('email');
    expect(str).toContain('retryable');
    expect(str).toContain('What to do');
    expect(str).not.toContain('password');
    expect(str).not.toContain('secret');
  });

  it('toJSON returns a plain object with expected keys', () => {
    const json = err.toJSON();
    expect(json.code).toBe('TIMEOUT');
    expect(json.isRetryable).toBe(true);
    expect(json.provider).toBe('email');
    expect(json.context).toBeDefined();
    expect(json.recovery).toBeDefined();
  });

  it('timestamp is a valid ISO string', () => {
    expect(() => new Date(err.timestamp)).not.toThrow();
    expect(new Date(err.timestamp).toISOString()).toBe(err.timestamp);
  });
});

// ---------------------------------------------------------------------------
// Typed error subclasses
// ---------------------------------------------------------------------------

describe('OTPNotFoundError', () => {
  const err = OTPErrorFactory.notFound({ provider: 'email', timeoutMs: 30_000, attemptsMade: 10 });

  it('has code OTP_NOT_FOUND', () => expect(err.code).toBe('OTP_NOT_FOUND'));
  it('is retryable', () => expect(err.isRetryable).toBe(true));
  it('is an OTPNotFoundError instance', () => expect(err).toBeInstanceOf(OTPNotFoundError));
  it('recovery steps mention from filter', () => {
    expect(err.recovery.steps.some(s => s.includes('from'))).toBe(true);
  });
});

describe('OTPTimeoutError', () => {
  const err = OTPErrorFactory.timeout({ provider: 'sms', timeoutMs: 60_000, attemptsMade: 12 });

  it('has code TIMEOUT', () => expect(err.code).toBe('TIMEOUT'));
  it('is retryable', () => expect(err.isRetryable).toBe(true));
  it('is an OTPTimeoutError instance', () => expect(err).toBeInstanceOf(OTPTimeoutError));
  it('message includes timeout value', () => expect(err.message).toContain('60s'));
  it('message includes attempt count', () => expect(err.message).toContain('12 poll'));
});

describe('OTPConnectionError', () => {
  const err = OTPErrorFactory.connectionFailed({ provider: 'email', endpoint: 'imap.gmail.com', port: 993 });

  it('has code CONNECTION_FAILED', () => expect(err.code).toBe('CONNECTION_FAILED'));
  it('is retryable', () => expect(err.isRetryable).toBe(true));
  it('is an OTPConnectionError instance', () => expect(err).toBeInstanceOf(OTPConnectionError));
  it('message contains the endpoint', () => expect(err.message).toContain('imap.gmail.com'));
});

describe('OTPAuthenticationError', () => {
  const err = OTPErrorFactory.authFailed({ provider: 'email', account: '***@gmail.com' });

  it('has code AUTHENTICATION_FAILED', () => expect(err.code).toBe('AUTHENTICATION_FAILED'));
  it('is user_error severity', () => expect(err.severity).toBe('user_error'));
  it('isUserError is true', () => expect(err.isUserError).toBe(true));
  it('is an OTPAuthenticationError instance', () => expect(err).toBeInstanceOf(OTPAuthenticationError));
  it('recovery steps mention App Password', () => {
    expect(err.recovery.steps.some(s => s.includes('App Password'))).toBe(true);
  });
});

describe('OTPInvalidConfigError', () => {
  const err = OTPErrorFactory.invalidConfig(
    '"password" is required',
    ['password'],
    { provider: 'email', operation: 'validateEmailConfig' },
  );

  it('has code INVALID_CONFIG', () => expect(err.code).toBe('INVALID_CONFIG'));
  it('is config_error severity', () => expect(err.severity).toBe('config_error'));
  it('exposes invalidFields', () => expect(err.invalidFields).toEqual(['password']));
  it('is an OTPInvalidConfigError instance', () => expect(err).toBeInstanceOf(OTPInvalidConfigError));
});

describe('OTPExtractionError', () => {
  const err = OTPErrorFactory.extractionFailed({
    provider: 'email',
    sampleText: 'Your code is: XXXX',
    triedPatterns: ['/\\d{6}/'],
  });

  it('has code EXTRACTION_FAILED', () => expect(err.code).toBe('EXTRACTION_FAILED'));
  it('is user_error severity', () => expect(err.isUserError).toBe(true));
  it('is an OTPExtractionError instance', () => expect(err).toBeInstanceOf(OTPExtractionError));
  it('truncates sampleText to 200 chars', () => {
    const longErr = OTPErrorFactory.extractionFailed({ sampleText: 'x'.repeat(300) });
    expect((longErr.sampleText ?? '').length).toBe(200);
  });
});

describe('OTPMissingDependencyError', () => {
  const err = OTPErrorFactory.missingDependency('twilio', 'sms');

  it('has code MISSING_DEPENDENCY', () => expect(err.code).toBe('MISSING_DEPENDENCY'));
  it('exposes packageName', () => expect(err.packageName).toBe('twilio'));
  it('exposes installCommand', () => expect(err.installCommand).toBe('npm install twilio'));
  it('is an OTPMissingDependencyError instance', () => expect(err).toBeInstanceOf(OTPMissingDependencyError));
});

describe('OTPProviderError', () => {
  const err = OTPErrorFactory.providerError('Request failed', { provider: 'sms', httpStatus: 500 });

  it('has code PROVIDER_ERROR', () => expect(err.code).toBe('PROVIDER_ERROR'));
  it('message contains HTTP status', () => expect(err.message).toContain('HTTP 500'));
  it('is an OTPProviderError instance', () => expect(err).toBeInstanceOf(OTPProviderError));
});

describe('OTPRateLimitError', () => {
  const err = OTPErrorFactory.rateLimited({ provider: 'sms', httpStatus: 429, retryAfterMs: 30_000 });

  it('has code RATE_LIMITED', () => expect(err.code).toBe('RATE_LIMITED'));
  it('exposes retryAfterMs', () => expect(err.retryAfterMs).toBe(30_000));
  it('message contains retry info', () => expect(err.message).toContain('30s'));
});

// ---------------------------------------------------------------------------
// isOTPError / isOTPErrorCode guards
// ---------------------------------------------------------------------------

describe('isOTPError', () => {
  it('returns true for OTPNinjaError instances', () => {
    expect(isOTPError(OTPErrorFactory.timeout({ provider: 'email' }))).toBe(true);
  });

  it('returns false for plain Error', () => {
    expect(isOTPError(new Error('plain'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isOTPError('string')).toBe(false);
    expect(isOTPError(null)).toBe(false);
    expect(isOTPError(42)).toBe(false);
  });
});

describe('isOTPErrorCode', () => {
  const err = OTPErrorFactory.timeout({ provider: 'email' });

  it('returns true for matching code', () => {
    expect(isOTPErrorCode(err, 'TIMEOUT')).toBe(true);
  });

  it('returns false for non-matching code', () => {
    expect(isOTPErrorCode(err, 'OTP_NOT_FOUND')).toBe(false);
  });

  it('returns false for non-OTPNinjaError', () => {
    expect(isOTPErrorCode(new Error('x'), 'TIMEOUT')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OTPErrorFactory.fromUnknown
// ---------------------------------------------------------------------------

describe('OTPErrorFactory.fromUnknown', () => {
  it('returns the same OTPNinjaError if already typed', () => {
    const original = OTPErrorFactory.timeout({ provider: 'email' });
    const result = OTPErrorFactory.fromUnknown(original, 'email', 'test');
    expect(result).toBe(original);
  });

  it('classifies ECONNREFUSED as OTPConnectionError', () => {
    const nodeErr = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const result = OTPErrorFactory.fromUnknown(nodeErr, 'email', 'connect');
    expect(result.code).toBe('CONNECTION_FAILED');
  });

  it('classifies ETIMEDOUT as OTPNetworkError', () => {
    const nodeErr = Object.assign(new Error('socket timeout'), { code: 'ETIMEDOUT' });
    const result = OTPErrorFactory.fromUnknown(nodeErr, 'email', 'connect');
    expect(result.code).toBe('NETWORK_ERROR');
  });

  it('classifies auth-related messages as OTPAuthenticationError', () => {
    const result = OTPErrorFactory.fromUnknown(new Error('authentication failed'), 'email', 'connect');
    expect(result.code).toBe('AUTHENTICATION_FAILED');
  });

  it('falls back to PROVIDER_ERROR for unrecognised errors', () => {
    const result = OTPErrorFactory.fromUnknown(new Error('something unexpected'), 'sms', 'fetch');
    expect(result.code).toBe('PROVIDER_ERROR');
  });

  it('handles non-Error thrown values', () => {
    const result = OTPErrorFactory.fromUnknown('string thrown', 'totp', 'generate');
    expect(result.code).toBe('PROVIDER_ERROR');
  });
});
