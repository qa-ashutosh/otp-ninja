/**
 * otp-ninja — Configuration Validation
 *
 * All validation runs eagerly — before any IMAP connection, API call, or
 * polling loop is started. Users get precise, actionable errors immediately
 * instead of after a 30-second timeout.
 *
 * Design: pure functions, no side effects, no I/O.
 */

import {
  OTPErrorFactory,
  OTPInvalidConfigError,
  type OTPProvider,
} from './errors';

// ---------------------------------------------------------------------------
// Shared field validators
// ---------------------------------------------------------------------------

type ValidationResult = { valid: true } | { valid: false; field: string; reason: string };

function required(field: string, value: unknown): ValidationResult {
  if (value === undefined || value === null || value === '') {
    return { valid: false, field, reason: `"${field}" is required but was not provided` };
  }
  return { valid: true };
}

function mustBeString(field: string, value: unknown): ValidationResult {
  if (typeof value !== 'string') {
    return { valid: false, field, reason: `"${field}" must be a string, got ${typeof value}` };
  }
  return { valid: true };
}

function mustBePositiveNumber(field: string, value: unknown): ValidationResult {
  if (typeof value !== 'number' || !isFinite(value) || value <= 0) {
    return {
      valid: false,
      field,
      reason: `"${field}" must be a positive number, got ${JSON.stringify(value)}`,
    };
  }
  return { valid: true };
}

function mustBePositiveInteger(field: string, value: unknown): ValidationResult {
  const numCheck = mustBePositiveNumber(field, value);
  if (!numCheck.valid) return numCheck;
  if (!Number.isInteger(value)) {
    return { valid: false, field, reason: `"${field}" must be an integer, got ${value}` };
  }
  return { valid: true };
}

function mustBeValidPort(field: string, value: unknown): ValidationResult {
  const intCheck = mustBePositiveInteger(field, value);
  if (!intCheck.valid) return intCheck;
  if ((value as number) > 65535) {
    return { valid: false, field, reason: `"${field}" must be a valid port (1–65535), got ${value}` };
  }
  return { valid: true };
}

function mustLookLikeEmail(field: string, value: unknown): ValidationResult {
  const strCheck = mustBeString(field, value);
  if (!strCheck.valid) return strCheck;
  if (!(value as string).includes('@')) {
    return {
      valid: false,
      field,
      reason: `"${field}" does not look like an email address: "${value}"`,
    };
  }
  return { valid: true };
}

function mustBeNonEmptyString(field: string, value: unknown): ValidationResult {
  const strCheck = mustBeString(field, value);
  if (!strCheck.valid) return strCheck;
  if ((value as string).trim().length === 0) {
    return { valid: false, field, reason: `"${field}" must not be empty` };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Validation runner
// ---------------------------------------------------------------------------

function collectErrors(checks: ValidationResult[]): string[] {
  const errors: string[] = [];
  for (const check of checks) {
    if (!check.valid) errors.push(check.reason);
  }
  return errors;
}

function throwIfInvalid(
  errors: string[],
  fields: string[],
  provider: OTPProvider,
  operation: string,
): void {
  if (errors.length === 0) return;
  throw OTPErrorFactory.invalidConfig(
    errors.join('; '),
    fields,
    { provider, operation },
  );
}

// ---------------------------------------------------------------------------
// Email config validation
// ---------------------------------------------------------------------------

export interface EmailConfigInput {
  host?: unknown;
  port?: unknown;
  user?: unknown;
  password?: unknown;
  tls?: unknown;
  timeout?: unknown;
  pollInterval?: unknown;
  from?: unknown;
  subject?: unknown;
  mailbox?: unknown;
}

/**
 * Validate email (IMAP) configuration.
 * Throws OTPInvalidConfigError with precise field-level messages on failure.
 */
export function validateEmailConfig(config: EmailConfigInput): void {
  const checks: ValidationResult[] = [
    required('host', config.host),
    mustBeNonEmptyString('host', config.host),
    required('user', config.user),
    mustLookLikeEmail('user', config.user),
    required('password', config.password),
    mustBeNonEmptyString('password', config.password),
  ];

  // Optional but if provided must be valid
  if (config.port !== undefined) {
    checks.push(mustBeValidPort('port', config.port));
  }
  if (config.timeout !== undefined) {
    checks.push(mustBePositiveNumber('timeout', config.timeout));
    if (typeof config.timeout === 'number' && config.timeout < 5000) {
      checks.push({
        valid: false,
        field: 'timeout',
        reason: `"timeout" is ${config.timeout}ms which is very low — minimum recommended is 5000ms (5 seconds). OTP delivery can take several seconds.`,
      });
    }
  }
  if (config.pollInterval !== undefined) {
    checks.push(mustBePositiveNumber('pollInterval', config.pollInterval));
  }
  if (config.from !== undefined) {
    checks.push(mustBeNonEmptyString('from', config.from));
    // Common user mistake: setting `from` to their own email
    if (
      typeof config.user === 'string' &&
      typeof config.from === 'string' &&
      config.from.toLowerCase() === config.user.toLowerCase()
    ) {
      checks.push({
        valid: false,
        field: 'from',
        reason: `"from" is set to your own email address ("${config.from}"). The "from" filter matches the SENDER of the OTP email, not your own address. Set it to the sender, e.g. "no-reply@yourapp.com", or remove it entirely.`,
      });
    }
  }
  if (config.subject !== undefined) {
    checks.push(mustBeNonEmptyString('subject', config.subject));
  }
  if (config.tls !== undefined && typeof config.tls !== 'boolean') {
    checks.push({
      valid: false,
      field: 'tls',
      reason: `"tls" must be a boolean (true or false), got ${typeof config.tls}`,
    });
  }

  const errors = collectErrors(checks);
  const badFields = checks
    .filter((c): c is { valid: false; field: string; reason: string } => !c.valid)
    .map(c => c.field);

  throwIfInvalid(errors, badFields, 'email', 'validateEmailConfig');
}

// ---------------------------------------------------------------------------
// SMS config validation
// ---------------------------------------------------------------------------

export interface SMSTwilioConfigInput {
  accountSid?: unknown;
  authToken?: unknown;
  to?: unknown;
  timeout?: unknown;
  pollInterval?: unknown;
}

export interface SMSVonageConfigInput {
  apiKey?: unknown;
  apiSecret?: unknown;
  to?: unknown;
  timeout?: unknown;
  pollInterval?: unknown;
}

/**
 * Validate Twilio SMS configuration.
 */
export function validateTwilioConfig(config: SMSTwilioConfigInput): void {
  const checks: ValidationResult[] = [
    required('accountSid', config.accountSid),
    mustBeNonEmptyString('accountSid', config.accountSid),
    required('authToken', config.authToken),
    mustBeNonEmptyString('authToken', config.authToken),
    required('to', config.to),
    mustBeNonEmptyString('to', config.to),
  ];

  // Twilio AccountSid always starts with "AC"
  if (
    typeof config.accountSid === 'string' &&
    config.accountSid.length > 0 &&
    !config.accountSid.startsWith('AC')
  ) {
    checks.push({
      valid: false,
      field: 'accountSid',
      reason: `"accountSid" does not look like a valid Twilio Account SID. It should start with "AC". Check your Twilio Console dashboard.`,
    });
  }

  if (config.timeout !== undefined) {
    checks.push(mustBePositiveNumber('timeout', config.timeout));
  }
  if (config.pollInterval !== undefined) {
    checks.push(mustBePositiveNumber('pollInterval', config.pollInterval));
  }

  const errors = collectErrors(checks);
  const badFields = checks
    .filter((c): c is { valid: false; field: string; reason: string } => !c.valid)
    .map(c => c.field);

  throwIfInvalid(errors, badFields, 'sms', 'validateTwilioConfig');
}

/**
 * Validate Vonage SMS configuration.
 */
export function validateVonageConfig(config: SMSVonageConfigInput): void {
  const checks: ValidationResult[] = [
    required('apiKey', config.apiKey),
    mustBeNonEmptyString('apiKey', config.apiKey),
    required('apiSecret', config.apiSecret),
    mustBeNonEmptyString('apiSecret', config.apiSecret),
    required('to', config.to),
    mustBeNonEmptyString('to', config.to),
  ];

  if (config.timeout !== undefined) {
    checks.push(mustBePositiveNumber('timeout', config.timeout));
  }
  if (config.pollInterval !== undefined) {
    checks.push(mustBePositiveNumber('pollInterval', config.pollInterval));
  }

  const errors = collectErrors(checks);
  const badFields = checks
    .filter((c): c is { valid: false; field: string; reason: string } => !c.valid)
    .map(c => c.field);

  throwIfInvalid(errors, badFields, 'sms', 'validateVonageConfig');
}

// ---------------------------------------------------------------------------
// TOTP config validation
// ---------------------------------------------------------------------------

// Base32 character set
const BASE32_RE = /^[A-Z2-7]+=*$/i;

export interface TOTPConfigInput {
  secret?: unknown;
  digits?: unknown;
  period?: unknown;
  algorithm?: unknown;
  issuer?: unknown;
}

/**
 * Validate TOTP configuration.
 */
export function validateTOTPConfig(config: TOTPConfigInput): void {
  const checks: ValidationResult[] = [
    required('secret', config.secret),
    mustBeNonEmptyString('secret', config.secret),
  ];

  // Validate Base32 secret
  if (typeof config.secret === 'string' && config.secret.length > 0) {
    const cleaned = config.secret.replace(/\s/g, '').toUpperCase();
    if (!BASE32_RE.test(cleaned)) {
      checks.push({
        valid: false,
        field: 'secret',
        reason: `"secret" does not appear to be a valid Base32-encoded TOTP secret. It should only contain the characters A–Z and 2–7 (plus optional = padding). Copy the secret directly from your authenticator app or QR code setup page.`,
      });
    }
    if (cleaned.length < 16) {
      checks.push({
        valid: false,
        field: 'secret',
        reason: `"secret" is only ${cleaned.length} characters long. Valid TOTP secrets are typically 16–32 characters. It may be truncated.`,
      });
    }
  }

  if (config.digits !== undefined) {
    checks.push(mustBePositiveInteger('digits', config.digits));
    if (typeof config.digits === 'number' && (config.digits < 4 || config.digits > 10)) {
      checks.push({
        valid: false,
        field: 'digits',
        reason: `"digits" must be between 4 and 10. Standard TOTP uses 6 digits.`,
      });
    }
  }

  if (config.period !== undefined) {
    checks.push(mustBePositiveInteger('period', config.period));
    if (typeof config.period === 'number' && (config.period < 10 || config.period > 300)) {
      checks.push({
        valid: false,
        field: 'period',
        reason: `"period" must be between 10 and 300 seconds. Standard TOTP uses 30 seconds.`,
      });
    }
  }

  if (config.algorithm !== undefined) {
    const validAlgorithms = ['SHA1', 'SHA256', 'SHA512'];
    if (!validAlgorithms.includes(String(config.algorithm).toUpperCase())) {
      checks.push({
        valid: false,
        field: 'algorithm',
        reason: `"algorithm" must be one of: ${validAlgorithms.join(', ')}. Got "${config.algorithm}". Most apps use SHA1.`,
      });
    }
  }

  const errors = collectErrors(checks);
  const badFields = checks
    .filter((c): c is { valid: false; field: string; reason: string } => !c.valid)
    .map(c => c.field);

  throwIfInvalid(errors, badFields, 'totp', 'validateTOTPConfig');
}

// ---------------------------------------------------------------------------
// Re-export error type for consumers
// ---------------------------------------------------------------------------

export { OTPInvalidConfigError };
