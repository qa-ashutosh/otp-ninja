/**
 * otp-ninja — Unified Entry Point
 *
 * One import gives you everything: email, SMS, TOTP, extraction, and error types.
 */

// ---------------------------------------------------------------------------
// Universal fetchOTP — single function for all three providers
// ---------------------------------------------------------------------------

import { fetchEmailOTP } from './providers/email/imap';
import { fetchSMSOTP } from './providers/sms/sms';
import { generateFreshTOTP } from './providers/totp/totp';
import { OTPErrorFactory } from './core/errors';
import type { EmailOTPOptions } from './providers/email/imap';
import type { SMSOTPOptions } from './providers/sms/sms';
import type { TOTPOptions } from './providers/totp/totp';
import type { OTPExtractionResult } from './providers/email/imap';

export type FetchOTPOptions =
  | ({ type: 'email' } & EmailOTPOptions)
  | ({ type: 'sms' } & SMSOTPOptions)
  | ({ type: 'totp' } & TOTPOptions);

/**
 * Unified OTP fetch — handles email, SMS, and TOTP from a single call.
 *
 * @example
 * // Email
 * await fetchOTP({ type: 'email', host: 'imap.gmail.com', user: '...', password: '...' });
 *
 * // SMS
 * await fetchOTP({ type: 'sms', provider: 'twilio', accountSid: '...', authToken: '...', to: '...' });
 *
 * // TOTP
 * await fetchOTP({ type: 'totp', secret: '...' });
 */
export async function fetchOTP(options: FetchOTPOptions): Promise<OTPExtractionResult> {
  const { type, ...rest } = options;

  if (type === 'email') {
    return fetchEmailOTP(rest as EmailOTPOptions);
  }
  if (type === 'sms') {
    return fetchSMSOTP(rest as SMSOTPOptions);
  }
  if (type === 'totp') {
    const result = await generateFreshTOTP(rest as TOTPOptions);
    return {
      otp: result.otp,
      source: 'totp',
      provider: 'totp',
      fetchedAt: result.fetchedAt,
    };
  }

  throw OTPErrorFactory.invalidConfig(
    `Unknown type "${(options as { type: unknown }).type}". Valid values: "email", "sms", "totp".`,
    ['type'],
    { provider: 'unknown', operation: 'fetchOTP' },
  );
}

// ---------------------------------------------------------------------------
// Named exports — everything available at the top level
// ---------------------------------------------------------------------------

// Email
export { fetchEmailOTP } from './providers/email/imap';
export { gmailConfig, outlookConfig, EMAIL_PROVIDERS } from './providers/email/presets';
export type { EmailOTPOptions } from './providers/email/imap';

// SMS
export { fetchSMSOTP } from './providers/sms/sms';
export type { SMSOTPOptions, TwilioSMSOptions, VonageSMSOptions } from './providers/sms/sms';

// TOTP
export { generateTOTP, generateFreshTOTP, verifyTOTP } from './providers/totp/totp';
export type { TOTPOptions, TOTPResult, TOTPAlgorithm } from './providers/totp/totp';

// Core utilities
export { extractOTP } from './core/extractor';

// Error types and utilities
export {
  OTPNinjaError,
  OTPNotFoundError,
  OTPTimeoutError,
  OTPConnectionError,
  OTPAuthenticationError,
  OTPInvalidConfigError,
  OTPExtractionError,
  OTPMissingDependencyError,
  OTPProviderError,
  OTPNetworkError,
  OTPPermissionError,
  OTPRateLimitError,
  OTPErrorFactory,
  isOTPError,
  isOTPErrorCode,
  maskSensitive,
  maskEmail,
  maskPhone,
} from './core/errors';

export type {
  OTPErrorCode,
  OTPProvider,
  OTPSeverity,
  OTPErrorContext,
  OTPRecoveryGuide,
} from './core/errors';

export type { OTPExtractionResult } from './providers/email/imap';
