/**
 * otp-ninja — Email Provider Presets
 *
 * Pre-configured IMAP settings for popular email providers.
 * Use gmailConfig() and outlookConfig() helpers for the smoothest setup.
 */

import type { EmailOTPOptions } from './imap';

// ---------------------------------------------------------------------------
// Provider presets — host/port/tls for popular services
// ---------------------------------------------------------------------------

export const EMAIL_PROVIDERS = {
  gmail: {
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
  },
  outlook: {
    host: 'outlook.office365.com',
    port: 993,
    tls: true,
  },
  yahoo: {
    host: 'imap.mail.yahoo.com',
    port: 993,
    tls: true,
  },
  icloud: {
    host: 'imap.mail.me.com',
    port: 993,
    tls: true,
  },
  fastmail: {
    host: 'imap.fastmail.com',
    port: 993,
    tls: true,
  },
  zoho: {
    host: 'imap.zoho.com',
    port: 993,
    tls: true,
  },
} as const;

export type EmailProviderName = keyof typeof EMAIL_PROVIDERS;

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

interface CredentialsOnly {
  user: string;
  password: string;
}

type OTPOnlyOptions = Omit<EmailOTPOptions, 'host' | 'port' | 'tls' | 'user' | 'password'>;

/**
 * Build a Gmail IMAP config.
 *
 * Requires a 16-character App Password — NOT your regular Gmail password.
 * Generate one at: https://myaccount.google.com/apppasswords
 *
 * @example
 * fetchEmailOTP(gmailConfig({
 *   user: 'qa-bot@gmail.com',
 *   password: process.env.GMAIL_APP_PASSWORD!,
 * }, {
 *   from: 'no-reply@yourapp.com',
 *   timeout: 30_000,
 * }));
 */
export function gmailConfig(
  credentials: CredentialsOnly,
  otpOptions: OTPOnlyOptions = {},
): EmailOTPOptions {
  return {
    ...EMAIL_PROVIDERS.gmail,
    ...credentials,
    ...otpOptions,
  };
}

/**
 * Build an Outlook / Office 365 IMAP config.
 *
 * If IMAP is blocked by your organisation, ask IT to enable it or check:
 * Outlook Settings → Mail → Sync email → IMAP
 *
 * @example
 * fetchEmailOTP(outlookConfig({
 *   user: 'qa-bot@yourcompany.com',
 *   password: process.env.OUTLOOK_APP_PASSWORD!,
 * }));
 */
export function outlookConfig(
  credentials: CredentialsOnly,
  otpOptions: OTPOnlyOptions = {},
): EmailOTPOptions {
  return {
    ...EMAIL_PROVIDERS.outlook,
    ...credentials,
    ...otpOptions,
  };
}
