/**
 * otp-ninja — Enterprise Error Handling System
 *
 * Design principles applied:
 *  - Single Responsibility: each error class owns exactly one failure domain
 *  - Open/Closed: extend via subclasses, never modify base contracts
 *  - Liskov Substitution: every subclass is a valid OTPNinjaError
 *  - Discriminated union on `code` — exhaustive switch in consumers is safe
 *  - No credential leakage — maskSensitive() applied at construction time
 *  - Structured context object — machine-readable, not just a message string
 *  - Recovery hints — every error tells the user what to do next
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** All first-class error codes — discriminated union, never a plain string. */
export type OTPErrorCode =
  | 'OTP_NOT_FOUND'
  | 'TIMEOUT'
  | 'CONNECTION_FAILED'
  | 'INVALID_CONFIG'
  | 'PROVIDER_ERROR'
  | 'EXTRACTION_FAILED'
  | 'MISSING_DEPENDENCY'
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'PERMISSION_DENIED';

export type OTPProvider = 'email' | 'sms' | 'totp' | 'unknown';

export type OTPSeverity = 'fatal' | 'retryable' | 'user_error' | 'config_error';

/**
 * Structured context attached to every OTPNinjaError.
 * All fields are optional so callers compose only what is relevant.
 * Sensitive fields are scrubbed before this object is ever created.
 */
export interface OTPErrorContext {
  /** The provider that raised the error. */
  provider?: OTPProvider;
  /** The operation that was in progress (e.g. 'fetchEmail', 'pollForOTP'). */
  operation?: string;
  /** How many retry attempts were made before giving up. */
  attemptsMade?: number;
  /** Maximum attempts that were configured. */
  maxAttempts?: number;
  /** Timeout value in milliseconds that was configured. */
  timeoutMs?: number;
  /** How long the operation actually ran before failing, in ms. */
  elapsedMs?: number;
  /** IMAP host / SMS endpoint / TOTP issuer — never includes credentials. */
  endpoint?: string;
  /** Email address — username portion masked if needed. */
  account?: string;
  /** OTP length or format hint that was expected. */
  expectedFormat?: string;
  /** Raw HTTP status code from a provider API, if applicable. */
  httpStatus?: number;
  /** Provider-specific error code (e.g. Twilio error code 21211). */
  providerCode?: string | number;
  /** The subject of the email that was searched, if applicable. */
  emailSubject?: string;
  /** Whether the debug mode was active — helps with reproduction. */
  debugMode?: boolean;
  /** Any additional key/value pairs a specific error needs to surface. */
  extra?: Record<string, unknown>;
}

/** What the error recovery guide looks like. */
export interface OTPRecoveryGuide {
  /** One-line plain-English action item. */
  action: string;
  /** Ordered steps the user should follow. */
  steps: string[];
  /** Link to relevant docs or npm README section. */
  docsLink?: string;
}

// ---------------------------------------------------------------------------
// Credential masking — security-first
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = new Set([
  'password', 'pass', 'secret', 'token', 'apikey', 'api_key',
  'authtoken', 'accesstoken', 'accountsid', 'authsid',
  'privatekey', 'credential', 'credentials',
]);

/**
 * Recursively scrub any object, replacing sensitive values with '***'.
 * Safe to call on arbitrary nested structures — never throws.
 */
export function maskSensitive(value: unknown, depth = 0): unknown {
  if (depth > 10) return value; // guard against circular structures
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value; // strings are already plain
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map(item => maskSensitive(item, depth + 1));
  }
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = '***';
    } else {
      result[key] = maskSensitive(val, depth + 1);
    }
  }
  return result;
}

/**
 * Mask an email address: keep domain, replace local part with '***'.
 * john.doe@gmail.com → ***@gmail.com
 */
export function maskEmail(email: string): string {
  const idx = email.indexOf('@');
  if (idx === -1) return '***';
  return `***${email.slice(idx)}`;
}

/**
 * Mask a phone number: keep last 4 digits.
 * +14155552671 → ***2671
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `***${digits.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Base Error
// ---------------------------------------------------------------------------

/**
 * Base class for all otp-ninja errors.
 *
 * Every error carries:
 *  - `code`     — machine-readable discriminant, safe to switch on
 *  - `provider` — which subsystem raised the error
 *  - `severity` — whether the caller should retry or abort
 *  - `context`  — structured, credential-free diagnostic data
 *  - `recovery` — plain-English steps for the user
 *  - `cause`    — original underlying error (Node.js Error.cause pattern)
 */
export class OTPNinjaError extends Error {
  readonly code: OTPErrorCode;
  readonly provider: OTPProvider;
  readonly severity: OTPSeverity;
  readonly context: Readonly<OTPErrorContext>;
  readonly recovery: Readonly<OTPRecoveryGuide>;
  readonly timestamp: string;
  readonly cause: unknown;

  constructor(
    message: string,
    code: OTPErrorCode,
    provider: OTPProvider,
    severity: OTPSeverity,
    context: OTPErrorContext = {},
    recovery: OTPRecoveryGuide,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'OTPNinjaError';
    this.code = code;
    this.provider = provider;
    this.severity = severity;
    this.context = Object.freeze({ ...context });
    this.recovery = Object.freeze({ ...recovery });
    this.timestamp = new Date().toISOString();
    this.cause = cause;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Whether the caller may safely retry this operation. */
  get isRetryable(): boolean {
    return this.severity === 'retryable';
  }

  /** Whether the failure is caused by a user or config mistake (not a transient issue). */
  get isUserError(): boolean {
    return this.severity === 'user_error' || this.severity === 'config_error';
  }

  /**
   * Human-readable diagnostic block.
   * Safe to log — no credentials ever appear here.
   */
  toDiagnosticString(): string {
    const lines: string[] = [
      `[otp-ninja] ${this.name}: ${this.message}`,
      `  Code     : ${this.code}`,
      `  Provider : ${this.provider}`,
      `  Severity : ${this.severity}`,
      `  Time     : ${this.timestamp}`,
    ];

    const ctx = this.context;
    if (ctx.operation) lines.push(`  Operation: ${ctx.operation}`);
    if (ctx.endpoint) lines.push(`  Endpoint : ${ctx.endpoint}`);
    if (ctx.account) lines.push(`  Account  : ${ctx.account}`);
    if (ctx.attemptsMade !== undefined)
      lines.push(`  Attempts : ${ctx.attemptsMade}${ctx.maxAttempts !== undefined ? ` / ${ctx.maxAttempts}` : ''}`);
    if (ctx.elapsedMs !== undefined) lines.push(`  Elapsed  : ${ctx.elapsedMs}ms`);
    if (ctx.timeoutMs !== undefined) lines.push(`  Timeout  : ${ctx.timeoutMs}ms`);
    if (ctx.httpStatus !== undefined) lines.push(`  HTTP     : ${ctx.httpStatus}`);
    if (ctx.providerCode !== undefined) lines.push(`  ProvCode : ${ctx.providerCode}`);
    if (ctx.expectedFormat) lines.push(`  Expected : ${ctx.expectedFormat}`);
    if (ctx.emailSubject) lines.push(`  Subject  : "${ctx.emailSubject}"`);

    lines.push('');
    lines.push('  What to do:');
    lines.push(`    ${this.recovery.action}`);
    this.recovery.steps.forEach((step, i) => {
      lines.push(`    ${i + 1}. ${step}`);
    });
    if (this.recovery.docsLink) {
      lines.push(`    Docs: ${this.recovery.docsLink}`);
    }

    if (this.cause instanceof Error) {
      lines.push('');
      lines.push(`  Caused by: ${this.cause.message}`);
    }

    return lines.join('\n');
  }

  /** Serialise to a plain object safe for structured loggers (Winston, Pino, Datadog). */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      provider: this.provider,
      severity: this.severity,
      context: this.context,
      recovery: this.recovery,
      timestamp: this.timestamp,
      isRetryable: this.isRetryable,
      cause: this.cause instanceof Error
        ? { message: this.cause.message, name: this.cause.name }
        : undefined,
    };
  }
}

// ---------------------------------------------------------------------------
// Typed Subclasses — one per failure domain
// ---------------------------------------------------------------------------

/**
 * Raised when no OTP could be found after exhausting all retry attempts.
 *
 * Common causes:
 *  - Email/SMS not delivered yet (increase timeout)
 *  - Wrong mailbox or phone number
 *  - OTP already read and deleted before the fetch
 *  - Subject filter / from filter too restrictive
 */
export class OTPNotFoundError extends OTPNinjaError {
  constructor(
    context: OTPErrorContext & {
      searchedMailbox?: string;
      sinceDate?: string;
      fromFilter?: string;
      subjectFilter?: string;
    },
    cause?: unknown,
  ) {
    const providerLabel = context.provider ?? 'email';
    const attemptsInfo = context.attemptsMade !== undefined && context.timeoutMs !== undefined
      ? ` after ${context.attemptsMade} attempt(s) over ${context.timeoutMs / 1000}s`
      : '';

    super(
      `No OTP found in ${providerLabel} inbox${attemptsInfo}. The message may not have arrived yet, or your filters may be too restrictive.`,
      'OTP_NOT_FOUND',
      context.provider ?? 'email',
      'retryable',
      context,
      {
        action: 'Increase the timeout, relax your filters, or confirm the OTP was actually sent.',
        steps: [
          'Increase `timeout` to at least 60000 (60 seconds) if the sender is slow.',
          'Remove or broaden the `from` filter — it must match the sender address, not your own email.',
          'Remove or broaden the `subject` filter if you are unsure of the exact subject line.',
          'Open your inbox manually and confirm the OTP email/SMS has arrived.',
          'If using Gmail, make sure IMAP is enabled: Google Account → Security → Less secure apps OR use an App Password.',
          'Enable debug mode: OTP_NINJA_DEBUG=true — it shows every message polled.',
        ],
        docsLink: 'https://github.com/qa-ashutosh/otp-ninja#email-otp',
      },
      cause,
    );
    this.name = 'OTPNotFoundError';
    Object.setPrototypeOf(this, OTPNotFoundError.prototype);
  }
}

/**
 * Raised when the polling loop exceeds the configured timeout before finding an OTP.
 *
 * Distinct from OTPNotFoundError: timeout means time ran out, not that messages were absent.
 */
export class OTPTimeoutError extends OTPNinjaError {
  constructor(
    context: OTPErrorContext,
    cause?: unknown,
  ) {
    const secs = context.timeoutMs !== undefined ? `${context.timeoutMs / 1000}s` : 'the configured timeout';
    const attempts = context.attemptsMade !== undefined ? ` (${context.attemptsMade} poll(s) made)` : '';

    super(
      `OTP polling timed out after ${secs}${attempts}. The message was not received within the allowed window.`,
      'TIMEOUT',
      context.provider ?? 'unknown',
      'retryable',
      context,
      {
        action: 'Increase the timeout or check for delivery delays on the sending side.',
        steps: [
          `Your current timeout is ${secs} — try doubling it: { timeout: ${(context.timeoutMs ?? 30000) * 2} }.`,
          'Check whether the OTP sender (email/SMS provider) is experiencing delays.',
          'Verify the trigger that sends the OTP actually fired (e.g. the login button was clicked).',
          'If testing locally, add a deliberate delay before calling fetchOTP to let the message arrive.',
          'Use OTP_NINJA_DEBUG=true to see polling activity in real time.',
        ],
        docsLink: 'https://github.com/qa-ashutosh/otp-ninja#polling--retry',
      },
      cause,
    );
    this.name = 'OTPTimeoutError';
    Object.setPrototypeOf(this, OTPTimeoutError.prototype);
  }
}

/**
 * Raised when otp-ninja cannot connect to the remote server (IMAP, Twilio API, etc.).
 *
 * Common causes:
 *  - Wrong host or port
 *  - Firewall blocking outbound connections
 *  - Corporate proxy intercepting TLS
 *  - IMAP disabled on the mail provider
 */
export class OTPConnectionError extends OTPNinjaError {
  constructor(
    context: OTPErrorContext & { port?: number },
    cause?: unknown,
  ) {
    const endpoint = context.endpoint ?? 'the remote server';
    const port = (context as { port?: number }).port;
    const portInfo = port ? `:${port}` : '';

    super(
      `Could not connect to ${endpoint}${portInfo}. Check network access, host/port settings, and whether the service is available.`,
      'CONNECTION_FAILED',
      context.provider ?? 'unknown',
      'retryable',
      context,
      {
        action: 'Verify the host, port, and network connectivity, then retry.',
        steps: [
          `Confirm the host is correct: "${endpoint}".`,
          port
            ? `Confirm port ${port} is open outbound (try: \`telnet ${endpoint} ${port}\`).`
            : 'Confirm the port is open outbound (993 for IMAP, 465/587 for SMTP).',
          'If you are behind a corporate firewall or proxy, IMAP ports may be blocked — ask your IT team.',
          'For Gmail: ensure IMAP is enabled at Google Account → Security → App Passwords.',
          'For Outlook/Office 365: IMAP may require IT admin enablement.',
          'Try connecting from a different network to rule out local firewall issues.',
        ],
        docsLink: 'https://github.com/qa-ashutosh/otp-ninja#email-providers',
      },
      cause,
    );
    this.name = 'OTPConnectionError';
    Object.setPrototypeOf(this, OTPConnectionError.prototype);
  }
}

/**
 * Raised when credentials are rejected by the mail server or SMS provider.
 *
 * Common causes:
 *  - Wrong password or App Password
 *  - 2FA enabled but regular password used (need App Password)
 *  - Twilio AccountSid or AuthToken is wrong
 *  - Token expired
 */
export class OTPAuthenticationError extends OTPNinjaError {
  constructor(
    context: OTPErrorContext,
    cause?: unknown,
  ) {
    const provider = context.provider ?? 'unknown';
    const account = context.account ?? 'the configured account';

    super(
      `Authentication failed for ${account} via ${provider}. Credentials were rejected by the server.`,
      'AUTHENTICATION_FAILED',
      provider,
      'user_error',
      context,
      {
        action: 'Check your credentials — do not use your regular password if 2FA is enabled.',
        steps: [
          'For Gmail: you MUST use a 16-character App Password, not your Gmail login password.',
          '  Generate one at: https://myaccount.google.com/apppasswords',
          '  Label it "otp-ninja" and copy the generated password exactly (no spaces).',
          'For Outlook/O365: enable App Passwords at https://aka.ms/MFASetup',
          'For Twilio: verify your AccountSid starts with "AC" and your AuthToken is copied in full.',
          'For Vonage: check your API key and secret in the Vonage dashboard.',
          'Double-check for trailing spaces or line-break characters in your .env file.',
          'Rotate credentials if you suspect they have been compromised.',
        ],
        docsLink: 'https://github.com/qa-ashutosh/otp-ninja#authentication',
      },
      cause,
    );
    this.name = 'OTPAuthenticationError';
    Object.setPrototypeOf(this, OTPAuthenticationError.prototype);
  }
}

/**
 * Raised when user-supplied configuration is missing or structurally invalid.
 * Detected eagerly — before any network call is made.
 *
 * Common causes:
 *  - Missing required field (host, user, password, secret, etc.)
 *  - Wrong type (e.g. timeout as a string instead of number)
 *  - Conflicting options
 */
export class OTPInvalidConfigError extends OTPNinjaError {
  readonly invalidFields: string[];

  constructor(
    message: string,
    invalidFields: string[],
    context: OTPErrorContext,
    cause?: unknown,
  ) {
    super(
      `Invalid configuration: ${message}`,
      'INVALID_CONFIG',
      context.provider ?? 'unknown',
      'config_error',
      context,
      {
        action: 'Fix the configuration fields listed below, then retry.',
        steps: [
          `Invalid or missing field(s): ${invalidFields.join(', ')}.`,
          'Check the TypeScript types — your IDE IntelliSense shows all required fields.',
          'Use the helper functions for standard providers: gmailConfig(), outlookConfig().',
          'Confirm all environment variables referenced in your config are actually set.',
          'Run with OTP_NINJA_DEBUG=true to see the resolved config (credentials are masked).',
        ],
        docsLink: 'https://github.com/qa-ashutosh/otp-ninja#configuration',
      },
      cause,
    );
    this.name = 'OTPInvalidConfigError';
    this.invalidFields = invalidFields;
    Object.setPrototypeOf(this, OTPInvalidConfigError.prototype);
  }
}

/**
 * Raised when the email body or SMS text was found but no OTP pattern matched.
 *
 * Distinct from OTPNotFoundError — the message arrived, but extraction failed.
 * This almost always means the regex does not match the OTP format in use.
 */
export class OTPExtractionError extends OTPNinjaError {
  readonly sampleText?: string;

  constructor(
    context: OTPErrorContext & { sampleText?: string; triedPatterns?: string[] },
    cause?: unknown,
  ) {
    const { sampleText, triedPatterns, ...baseCtx } = context as OTPErrorContext & {
      sampleText?: string;
      triedPatterns?: string[];
    };
    const patternInfo = triedPatterns?.length
      ? ` Tried ${triedPatterns.length} pattern(s): ${triedPatterns.join(', ')}.`
      : '';

    super(
      `OTP extraction failed — a message was found but no OTP pattern matched.${patternInfo}`,
      'EXTRACTION_FAILED',
      context.provider ?? 'unknown',
      'user_error',
      baseCtx,
      {
        action: 'Provide a custom regex that matches your OTP format, or check the message content.',
        steps: [
          'Enable OTP_NINJA_DEBUG=true to print the raw message body — inspect it for the OTP.',
          'If your OTP is not 4–8 digits, provide a custom `otpPattern` regex in options.',
          'Example: { otpPattern: /verification code[:\\s]+(\\w{6})/i }',
          'If the email uses HTML, make sure quoted-printable decoding is working (it is on by default).',
          'Check that the OTP is not inside an image (images cannot be parsed).',
          'Use extractOTP(text, { otpPattern: /your-pattern/ }) standalone to test your regex.',
        ],
        docsLink: 'https://github.com/qa-ashutosh/otp-ninja#otp-extraction',
      },
      cause,
    );
    this.name = 'OTPExtractionError';
    this.sampleText = sampleText ? sampleText.slice(0, 200) : undefined; // never log full body
    Object.setPrototypeOf(this, OTPExtractionError.prototype);
  }
}

/**
 * Raised when an optional peer dependency (twilio, @vonage/server-sdk) is not installed.
 *
 * otp-ninja uses peer deps so users only install what they actually need.
 * This error gives the exact install command.
 */
export class OTPMissingDependencyError extends OTPNinjaError {
  readonly packageName: string;
  readonly installCommand: string;

  constructor(
    packageName: string,
    provider: OTPProvider,
    context: OTPErrorContext = {},
    cause?: unknown,
  ) {
    const installCommand = `npm install ${packageName}`;

    super(
      `Missing peer dependency: "${packageName}" is required for the ${provider} provider but is not installed.`,
      'MISSING_DEPENDENCY',
      provider,
      'user_error',
      context,
      {
        action: `Install the missing package: ${installCommand}`,
        steps: [
          `Run: ${installCommand}`,
          'If using yarn: ' + `yarn add ${packageName}`,
          'If using pnpm: ' + `pnpm add ${packageName}`,
          'otp-ninja uses peer dependencies so you only install providers you actually use.',
          'After installing, re-run your test — no rebuild needed.',
          'If you already installed it, the issue may be a workspace hoisting problem.',
          '  Try: npm install ' + packageName + ' @ashforge/otp-ninja  (both in one command)',
        ],
        docsLink: 'https://github.com/qa-ashutosh/otp-ninja#installation',
      },
      cause,
    );
    this.name = 'OTPMissingDependencyError';
    this.packageName = packageName;
    this.installCommand = installCommand;
    Object.setPrototypeOf(this, OTPMissingDependencyError.prototype);
  }
}

/**
 * Raised when the SMS or email provider's API returns an error response.
 *
 * Wraps provider-specific errors (Twilio REST error, IMAP server error, etc.)
 * with normalized context so callers do not need to inspect provider internals.
 */
export class OTPProviderError extends OTPNinjaError {
  constructor(
    message: string,
    context: OTPErrorContext,
    cause?: unknown,
  ) {
    const provider = context.provider ?? 'unknown';
    const httpInfo = context.httpStatus ? ` (HTTP ${context.httpStatus})` : '';
    const codeInfo = context.providerCode ? ` [provider code: ${context.providerCode}]` : '';

    super(
      `Provider error from ${provider}${httpInfo}${codeInfo}: ${message}`,
      'PROVIDER_ERROR',
      provider,
      'retryable',
      context,
      {
        action: 'Check the provider error details and your account configuration.',
        steps: [
          context.httpStatus === 401 || context.httpStatus === 403
            ? 'Authentication failed — verify your API credentials are correct and not expired.'
            : context.httpStatus === 429
              ? 'Rate limit hit — wait before retrying, or reduce polling frequency.'
              : context.httpStatus !== undefined && context.httpStatus >= 500
                ? 'The provider is experiencing server-side issues — retry after a short delay.'
                : 'Review the provider error message above for specific guidance.',
          'For Twilio errors: look up the code at https://www.twilio.com/docs/errors',
          'For Vonage errors: check https://developer.vonage.com/en/api-errors',
          'Enable OTP_NINJA_DEBUG=true to see the full provider response.',
          'Verify your account has sufficient credits/quota.',
        ],
        docsLink: 'https://github.com/qa-ashutosh/otp-ninja#sms-providers',
      },
      cause,
    );
    this.name = 'OTPProviderError';
    Object.setPrototypeOf(this, OTPProviderError.prototype);
  }
}

/**
 * Raised for transient network failures: DNS resolution, TLS handshake, socket timeout.
 * Distinct from OTPConnectionError (which is about wrong config) — this is infrastructure noise.
 */
export class OTPNetworkError extends OTPNinjaError {
  constructor(
    context: OTPErrorContext,
    cause?: unknown,
  ) {
    super(
      `A network error occurred while communicating with the ${context.provider ?? 'remote'} provider. This may be transient.`,
      'NETWORK_ERROR',
      context.provider ?? 'unknown',
      'retryable',
      context,
      {
        action: 'Retry the operation — network errors are often transient.',
        steps: [
          'Retry immediately — DNS glitches, TLS hiccups, and short outages are common.',
          'If the error repeats, check your internet/VPN connectivity.',
          'Check whether the provider has an active incident: https://status.twilio.com',
          'If behind a corporate proxy, ensure it allows TLS passthrough on port 993 (IMAP).',
          'Enable OTP_NINJA_DEBUG=true to see the full network error details.',
        ],
        docsLink: 'https://github.com/qa-ashutosh/otp-ninja#network-errors',
      },
      cause,
    );
    this.name = 'OTPNetworkError';
    Object.setPrototypeOf(this, OTPNetworkError.prototype);
  }
}

/**
 * Raised when the mail server denies access to a mailbox or folder.
 * Distinct from authentication failure — the credentials are valid but permissions are wrong.
 */
export class OTPPermissionError extends OTPNinjaError {
  constructor(
    context: OTPErrorContext & { mailbox?: string },
    cause?: unknown,
  ) {
    const mailbox = (context as OTPErrorContext & { mailbox?: string }).mailbox ?? 'INBOX';

    super(
      `Permission denied accessing mailbox "${mailbox}". The credentials are valid but the account lacks access rights.`,
      'PERMISSION_DENIED',
      context.provider ?? 'email',
      'user_error',
      context,
      {
        action: 'Check IMAP access rights and mailbox configuration for this account.',
        steps: [
          `Verify the mailbox name is correct — you specified: "${mailbox}".`,
          'For shared/delegated mailboxes, confirm the authenticated user has IMAP access.',
          'For Gmail: check if Less Secure App access is on, or use an App Password.',
          'For Exchange/O365: ensure IMAP is enabled in the admin panel for this mailbox.',
          'Try specifying mailbox as "INBOX" (uppercase) — some servers are case-sensitive.',
          'Contact your IT admin if the mailbox is a shared/group mailbox.',
        ],
        docsLink: 'https://github.com/qa-ashutosh/otp-ninja#email-providers',
      },
      cause,
    );
    this.name = 'OTPPermissionError';
    Object.setPrototypeOf(this, OTPPermissionError.prototype);
  }
}

/**
 * Raised when the SMS or email API rate limit is exceeded.
 */
export class OTPRateLimitError extends OTPNinjaError {
  readonly retryAfterMs?: number;

  constructor(
    context: OTPErrorContext & { retryAfterMs?: number },
    cause?: unknown,
  ) {
    const retryAfterMs = (context as OTPErrorContext & { retryAfterMs?: number }).retryAfterMs;
    const retryInfo = retryAfterMs ? ` Retry after ${retryAfterMs / 1000}s.` : '';

    super(
      `Rate limit exceeded for ${context.provider ?? 'provider'} API.${retryInfo}`,
      'RATE_LIMITED',
      context.provider ?? 'unknown',
      'retryable',
      context,
      {
        action: 'Wait before retrying, and reduce polling frequency.',
        steps: [
          retryAfterMs
            ? `Wait ${retryAfterMs / 1000} seconds before retrying (as specified by the provider).`
            : 'Wait at least 30 seconds before retrying.',
          'Increase the `pollInterval` option to reduce how often otp-ninja polls.',
          'For Twilio free trial accounts, the rate limit is lower — upgrade if needed.',
          'Consider caching the OTP in your test instead of fetching it multiple times.',
        ],
        docsLink: 'https://github.com/qa-ashutosh/otp-ninja#polling--retry',
      },
      cause,
    );
    this.name = 'OTPRateLimitError';
    this.retryAfterMs = retryAfterMs;
    Object.setPrototypeOf(this, OTPRateLimitError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Error Factory — single entry point for error construction
// ---------------------------------------------------------------------------

/**
 * Central factory for creating typed OTPNinjaErrors.
 * Use this instead of calling constructors directly — it normalises context
 * and applies maskSensitive() before any data is stored.
 *
 * @example
 * throw OTPErrorFactory.notFound({ provider: 'email', timeoutMs: 30000, attemptsMade: 10 });
 */
export const OTPErrorFactory = {
  notFound(context: OTPErrorContext, cause?: unknown): OTPNotFoundError {
    return new OTPNotFoundError(sanitizeContext(context), cause);
  },

  timeout(context: OTPErrorContext, cause?: unknown): OTPTimeoutError {
    return new OTPTimeoutError(sanitizeContext(context), cause);
  },

  connectionFailed(context: OTPErrorContext & { port?: number }, cause?: unknown): OTPConnectionError {
    return new OTPConnectionError(sanitizeContext(context) as OTPErrorContext & { port?: number }, cause);
  },

  authFailed(context: OTPErrorContext, cause?: unknown): OTPAuthenticationError {
    return new OTPAuthenticationError(sanitizeContext(context), cause);
  },

  invalidConfig(
    message: string,
    invalidFields: string[],
    context: OTPErrorContext,
    cause?: unknown,
  ): OTPInvalidConfigError {
    return new OTPInvalidConfigError(message, invalidFields, sanitizeContext(context), cause);
  },

  extractionFailed(
    context: OTPErrorContext & { sampleText?: string; triedPatterns?: string[] },
    cause?: unknown,
  ): OTPExtractionError {
    return new OTPExtractionError(sanitizeContext(context) as OTPErrorContext & { sampleText?: string; triedPatterns?: string[] }, cause);
  },

  missingDependency(
    packageName: string,
    provider: OTPProvider,
    context?: OTPErrorContext,
    cause?: unknown,
  ): OTPMissingDependencyError {
    return new OTPMissingDependencyError(packageName, provider, sanitizeContext(context ?? {}), cause);
  },

  providerError(message: string, context: OTPErrorContext, cause?: unknown): OTPProviderError {
    return new OTPProviderError(message, sanitizeContext(context), cause);
  },

  networkError(context: OTPErrorContext, cause?: unknown): OTPNetworkError {
    return new OTPNetworkError(sanitizeContext(context), cause);
  },

  permissionDenied(context: OTPErrorContext & { mailbox?: string }, cause?: unknown): OTPPermissionError {
    return new OTPPermissionError(sanitizeContext(context) as OTPErrorContext & { mailbox?: string }, cause);
  },

  rateLimited(
    context: OTPErrorContext & { retryAfterMs?: number },
    cause?: unknown,
  ): OTPRateLimitError {
    return new OTPRateLimitError(sanitizeContext(context) as OTPErrorContext & { retryAfterMs?: number }, cause);
  },

  /**
   * Wraps any unknown thrown value into a typed OTPNinjaError.
   * Use this in catch blocks to normalise third-party errors.
   */
  fromUnknown(
    thrown: unknown,
    provider: OTPProvider,
    operation: string,
  ): OTPNinjaError {
    if (thrown instanceof OTPNinjaError) return thrown;

    const cause = thrown instanceof Error ? thrown : undefined;
    const causeMessage = thrown instanceof Error ? thrown.message : String(thrown);

    // Classify common Node.js / provider error patterns
    if (thrown instanceof Error) {
      const msg = thrown.message.toLowerCase();
      const code = (thrown as NodeJS.ErrnoException).code;

      if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
        return OTPErrorFactory.connectionFailed({ provider, operation }, thrown);
      }
      if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
        return OTPErrorFactory.networkError({ provider, operation }, thrown);
      }
      if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        return OTPErrorFactory.connectionFailed({ provider, operation, endpoint: msg }, thrown);
      }
      if (msg.includes('auth') || msg.includes('login') || msg.includes('credential') || msg.includes('password')) {
        return OTPErrorFactory.authFailed({ provider, operation }, thrown);
      }
      if (msg.includes('rate limit') || msg.includes('too many requests')) {
        return OTPErrorFactory.rateLimited({ provider, operation }, thrown);
      }
      if (msg.includes('permission') || msg.includes('access denied') || msg.includes('not allowed')) {
        return OTPErrorFactory.permissionDenied({ provider, operation }, thrown);
      }
      if (msg.includes('network') || msg.includes('tls') || msg.includes('ssl') || msg.includes('handshake')) {
        return OTPErrorFactory.networkError({ provider, operation }, thrown);
      }
    }

    // Fallback — generic provider error
    return OTPErrorFactory.providerError(
      causeMessage,
      { provider, operation },
      cause,
    );
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Scrub any context object before it enters an error — credential-safe. */
function sanitizeContext<T extends OTPErrorContext>(ctx: T): T {
  return maskSensitive(ctx) as T;
}

/**
 * Type guard — check if a caught value is any OTPNinjaError.
 *
 * @example
 * try { await fetchOTP(options) }
 * catch (err) {
 *   if (isOTPError(err)) console.log(err.toDiagnosticString())
 * }
 */
export function isOTPError(value: unknown): value is OTPNinjaError {
  return value instanceof OTPNinjaError;
}

/**
 * Type guard for a specific error code.
 *
 * @example
 * if (isOTPErrorCode(err, 'TIMEOUT')) { ... }
 */
export function isOTPErrorCode(value: unknown, code: OTPErrorCode): value is OTPNinjaError {
  return value instanceof OTPNinjaError && value.code === code;
}
