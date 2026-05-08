/**
 * otp-ninja — Email / IMAP Provider
 *
 * Error handling contract:
 *  - validateEmailConfig() runs FIRST — invalid config throws OTPInvalidConfigError
 *    immediately, before any network connection is attempted.
 *  - All imapflow errors are caught and classified through OTPErrorFactory.fromUnknown()
 *    so callers always receive a typed OTPNinjaError, never a raw imapflow error.
 *  - Credentials never appear in error messages — maskEmail() applied to user field.
 *  - Polling loop yields OTPTimeoutError (not OTPNotFoundError) when time runs out.
 *  - Body extraction yields OTPExtractionError with sampleText when pattern fails.
 */

import { ImapFlow, type FetchMessageObject } from 'imapflow';
import {
  OTPErrorFactory,
  OTPNinjaError,
  maskEmail,
  type OTPProvider,
} from '../../core/errors';
import { validateEmailConfig } from '../../core/validator';
import { extractOTP } from '../../core/extractor';
import { decodeQuotedPrintable } from '../../core/qp';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailOTPOptions {
  host: string;
  port?: number;
  tls?: boolean;
  user: string;
  password: string;
  from?: string;
  subject?: string;
  mailbox?: string;
  /** Milliseconds before giving up. Default: 30 000. */
  timeout?: number;
  /** Milliseconds between polls. Default: 3 000. */
  pollInterval?: number;
  /** Custom regex to extract the OTP. */
  otpPattern?: RegExp;
}

export interface OTPExtractionResult {
  otp: string;
  source: string;
  provider: OTPProvider;
  fetchedAt: string;
}

const PROVIDER: OTPProvider = 'email';
const OPERATION = 'fetchEmailOTP';
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_POLL_INTERVAL = 3_000;
const DEFAULT_PORT = 993;

// ---------------------------------------------------------------------------
// Debug logger — never logs credentials
// ---------------------------------------------------------------------------

const DEBUG = process.env['OTP_NINJA_DEBUG'] === 'true';
function debug(msg: string, ...args: unknown[]): void {
  if (DEBUG) console.log(`[otp-ninja:email] ${msg}`, ...args);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Fetch an OTP from an email inbox via IMAP with smart retry/polling.
 *
 * @throws {OTPInvalidConfigError}   Bad or missing configuration fields.
 * @throws {OTPConnectionError}      Could not reach the IMAP server.
 * @throws {OTPAuthenticationError}  Credentials rejected by the server.
 * @throws {OTPPermissionError}      Mailbox access denied.
 * @throws {OTPTimeoutError}         Polling exhausted without finding an OTP.
 * @throws {OTPExtractionError}      Email found but OTP pattern did not match.
 * @throws {OTPNetworkError}         Transient network failure.
 */
export async function fetchEmailOTP(options: EmailOTPOptions): Promise<OTPExtractionResult> {
  // Phase 1: eager validation — no network yet
  validateEmailConfig({
    host: options.host,
    port: options.port,
    user: options.user,
    password: options.password,
    tls: options.tls,
    timeout: options.timeout,
    pollInterval: options.pollInterval,
    from: options.from,
    subject: options.subject,
    mailbox: options.mailbox,
  });

  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
  const mailbox = options.mailbox ?? 'INBOX';
  const maskedAccount = maskEmail(options.user);

  debug(`Starting OTP poll for ${maskedAccount} on ${options.host}`);
  debug(`Timeout: ${timeout}ms, poll interval: ${pollInterval}ms`);

  const startAt = Date.now();
  let attemptsMade = 0;

  // Phase 2: polling loop
  while (Date.now() - startAt < timeout) {
    attemptsMade++;
    debug(`Poll attempt #${attemptsMade}`);

    let client: ImapFlow | undefined;
    try {
      client = buildClient(options);
      await connectClient(client, options, maskedAccount);

      const result = await searchAndExtract(client, options, mailbox, maskedAccount, attemptsMade);

      if (result !== null) {
        debug(`OTP found on attempt #${attemptsMade}: ${result.otp}`);
        return result;
      }

      debug(`No OTP found on attempt #${attemptsMade}, waiting ${pollInterval}ms`);
    } catch (err) {
      // Re-throw errors that are fatal (config, auth, permission) — no point retrying
      if (err instanceof OTPNinjaError && !err.isRetryable) {
        throw err;
      }
      // Retryable errors (network blip, transient IMAP issue) — log and continue
      if (err instanceof OTPNinjaError) {
        debug(`Retryable error on attempt #${attemptsMade}: ${err.message}`);
      } else {
        debug(`Unknown error on attempt #${attemptsMade}:`, err);
      }
    } finally {
      await silentlyClose(client);
    }

    // Wait before next poll, but respect the overall timeout
    const remaining = timeout - (Date.now() - startAt);
    if (remaining <= 0) break;
    await sleep(Math.min(pollInterval, remaining));
  }

  // Phase 3: timeout
  throw OTPErrorFactory.timeout({
    provider: PROVIDER,
    operation: OPERATION,
    account: maskedAccount,
    endpoint: options.host,
    timeoutMs: timeout,
    attemptsMade,
    elapsedMs: Date.now() - startAt,
    debugMode: DEBUG,
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildClient(options: EmailOTPOptions): ImapFlow {
  return new ImapFlow({
    host: options.host,
    port: options.port ?? DEFAULT_PORT,
    secure: options.tls ?? true,
    auth: {
      user: options.user,
      pass: options.password,
    },
    logger: false, // we handle our own debug logging
  });
}

async function connectClient(
  client: ImapFlow,
  options: EmailOTPOptions,
  maskedAccount: string,
): Promise<void> {
  try {
    await client.connect();
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    const code = err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined;

    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      throw OTPErrorFactory.connectionFailed(
        {
          provider: PROVIDER,
          operation: 'connect',
          endpoint: options.host,
          port: options.port ?? DEFAULT_PORT,
          account: maskedAccount,
        },
        err,
      );
    }

    if (
      msg.includes('auth') ||
      msg.includes('login') ||
      msg.includes('invalid credentials') ||
      msg.includes('authentication failed') ||
      msg.includes('password') ||
      msg.includes('535')
    ) {
      throw OTPErrorFactory.authFailed(
        {
          provider: PROVIDER,
          operation: 'connect',
          endpoint: options.host,
          account: maskedAccount,
        },
        err,
      );
    }

    if (msg.includes('tls') || msg.includes('ssl') || msg.includes('handshake')) {
      throw OTPErrorFactory.networkError(
        {
          provider: PROVIDER,
          operation: 'tlsHandshake',
          endpoint: options.host,
          account: maskedAccount,
        },
        err,
      );
    }

    // Unknown — use the smart classifier
    throw OTPErrorFactory.fromUnknown(err, PROVIDER, 'connect');
  }
}

async function searchAndExtract(
  client: ImapFlow,
  options: EmailOTPOptions,
  mailbox: string,
  maskedAccount: string,
  attempt: number,
): Promise<OTPExtractionResult | null> {
  try {
    await client.mailboxOpen(mailbox);
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (
      msg.includes('no such mailbox') ||
      msg.includes('mailbox doesn') ||
      msg.includes('not found') ||
      msg.includes('access denied') ||
      msg.includes('permission')
    ) {
      throw OTPErrorFactory.permissionDenied(
        {
          provider: PROVIDER,
          operation: 'mailboxOpen',
          account: maskedAccount,
          endpoint: options.host,
          mailbox,
        },
        err,
      );
    }
    throw OTPErrorFactory.fromUnknown(err, PROVIDER, 'mailboxOpen');
  }

  // Construct search criteria
  const since = new Date();
  since.setHours(0, 0, 0, 0); // start of today — avoids timezone edge cases
  const criteria: Record<string, unknown> = { since };
  if (options.from) criteria['from'] = options.from;
  if (options.subject) criteria['subject'] = options.subject;

  debug(`Search criteria (attempt ${attempt}):`, { ...criteria, since: since.toISOString() });

  let messages: FetchMessageObject[] = [];
  try {
    for await (const msg of client.fetch(criteria as Parameters<typeof client.fetch>[0], {
      source: true,
      envelope: true,
    })) {
      messages.push(msg);
    }
  } catch (err) {
    throw OTPErrorFactory.fromUnknown(err, PROVIDER, 'fetchMessages');
  }

  debug(`Found ${messages.length} message(s) matching criteria`);

  if (messages.length === 0) return null;

  // Process most recent first
  messages = messages.reverse();

  for (const msg of messages) {
    const rawBody = msg.source?.toString('utf8') ?? '';
    debug(`Processing message uid=${msg.uid}, size=${rawBody.length} chars`);

    // Decode quoted-printable HTML encoding
    const decoded = decodeQuotedPrintable(rawBody);

    let otp: string | null = null;
    try {
      otp = extractOTP(decoded, { otpPattern: options.otpPattern });
    } catch (err) {
      // extractOTP threw — means body was found but pattern failed
      throw OTPErrorFactory.extractionFailed(
        {
          provider: PROVIDER,
          operation: 'extractOTP',
          account: maskedAccount,
          emailSubject: msg.envelope?.subject ?? undefined,
          sampleText: decoded.slice(0, 200),
          expectedFormat: options.otpPattern?.toString() ?? 'default 4-8 digit pattern',
        },
        err,
      );
    }

    if (otp !== null) {
      return {
        otp,
        source: 'email',
        provider: PROVIDER,
        fetchedAt: new Date().toISOString(),
      };
    }

    debug(`Message uid=${msg.uid} matched search but OTP not found in body — trying next`);
  }

  // Messages arrived but none had a matching OTP pattern
  // Return null here (not throw) — the poll loop will retry
  return null;
}

async function silentlyClose(client: ImapFlow | undefined): Promise<void> {
  if (!client) return;
  try {
    await client.logout();
  } catch {
    // Best-effort close — ignore errors here
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
