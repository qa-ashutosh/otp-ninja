/**
 * otp-ninja — SMS Provider (Twilio + Vonage)
 *
 * Error handling contract:
 *  - validateTwilioConfig() / validateVonageConfig() run FIRST.
 *  - Peer dependency absence yields OTPMissingDependencyError with exact install command.
 *  - Twilio/Vonage REST errors are normalised — HTTP status codes are classified
 *    into auth errors (401/403), rate limit errors (429), and server errors (5xx).
 *  - Credentials are never logged — accountSid and authToken masked in all errors.
 *  - Provider-specific error codes surfaced in context.providerCode for debugging.
 */

import { createRequire } from 'module';
import {
  OTPErrorFactory,
  OTPNinjaError,
  maskPhone,
  type OTPProvider,
} from '../../core/errors';
import { validateTwilioConfig, validateVonageConfig } from '../../core/validator';
import { extractOTP } from '../../core/extractor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TwilioSMSOptions {
  provider: 'twilio';
  accountSid: string;
  authToken: string;
  to: string;
  timeout?: number;
  pollInterval?: number;
  otpPattern?: RegExp;
}

export interface VonageSMSOptions {
  provider: 'vonage';
  apiKey: string;
  apiSecret: string;
  to: string;
  timeout?: number;
  pollInterval?: number;
  otpPattern?: RegExp;
}

export type SMSOTPOptions = TwilioSMSOptions | VonageSMSOptions;

export interface OTPExtractionResult {
  otp: string;
  source: string;
  provider: OTPProvider;
  fetchedAt: string;
}

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_POLL_INTERVAL = 5_000;

const DEBUG = process.env['OTP_NINJA_DEBUG'] === 'true';
function debug(msg: string, ...args: unknown[]): void {
  if (DEBUG) console.log(`[otp-ninja:sms] ${msg}`, ...args);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Fetch an OTP from an SMS message via Twilio or Vonage.
 *
 * @throws {OTPInvalidConfigError}      Bad or missing configuration fields.
 * @throws {OTPMissingDependencyError}  Peer dep (twilio) not installed.
 * @throws {OTPAuthenticationError}     Credentials rejected by provider API.
 * @throws {OTPRateLimitError}          Provider rate limit exceeded.
 * @throws {OTPProviderError}           Provider API returned an error response.
 * @throws {OTPTimeoutError}            Polling exhausted before OTP arrived.
 * @throws {OTPExtractionError}         SMS found but OTP pattern did not match.
 */
export async function fetchSMSOTP(options: SMSOTPOptions): Promise<OTPExtractionResult> {
  if (options.provider === 'twilio') {
    return fetchViaTwilio(options);
  }
  if (options.provider === 'vonage') {
    return fetchViaVonage(options);
  }
  // Exhaustive check — TypeScript ensures this never runs, but guard for JS consumers
  throw OTPErrorFactory.invalidConfig(
    `Unknown SMS provider "${(options as { provider: unknown }).provider}". Valid values: "twilio", "vonage".`,
    ['provider'],
    { provider: 'sms', operation: 'fetchSMSOTP' },
  );
}

// ---------------------------------------------------------------------------
// Twilio
// ---------------------------------------------------------------------------

async function fetchViaTwilio(options: TwilioSMSOptions): Promise<OTPExtractionResult> {
  // Phase 1: validate config eagerly
  validateTwilioConfig({
    accountSid: options.accountSid,
    authToken: options.authToken,
    to: options.to,
    timeout: options.timeout,
    pollInterval: options.pollInterval,
  });

  // Phase 2: resolve peer dependency from consumer's node_modules
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let twilioClient: any;
  try {
    const consumerRequire = createRequire(process.cwd() + '/package.json');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Twilio = consumerRequire('twilio');
    twilioClient = new Twilio(options.accountSid, options.authToken);
  } catch (err) {
    const isModuleNotFound =
      err instanceof Error &&
      (err.message.includes("Cannot find module 'twilio'") ||
        err.message.includes("MODULE_NOT_FOUND") ||
        (err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND');

    if (isModuleNotFound) {
      throw OTPErrorFactory.missingDependency('twilio', 'sms', {
        operation: 'fetchSMSOTP',
        extra: { attemptedCwd: process.cwd() },
      });
    }
    throw OTPErrorFactory.fromUnknown(err, 'sms', 'loadTwilioClient');
  }

  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
  const maskedTo = maskPhone(options.to);

  debug(`Starting Twilio SMS poll for ${maskedTo}`);

  const startAt = Date.now();
  let attemptsMade = 0;

  while (Date.now() - startAt < timeout) {
    attemptsMade++;
    debug(`Poll attempt #${attemptsMade}`);

    let messages;
    try {
      messages = await twilioClient.messages.list({
        to: options.to,
        limit: 5,
      });
    } catch (err) {
      const classified = classifyTwilioError(err, attemptsMade);
      if (!classified.isRetryable) throw classified;
      debug(`Retryable Twilio error on attempt #${attemptsMade}: ${classified.message}`);
      await sleep(Math.min(pollInterval, timeout - (Date.now() - startAt)));
      continue;
    }

    debug(`Received ${messages.length} message(s) from Twilio`);

    for (const message of messages) {
      const body: string = message.body ?? '';
      debug(`Checking message sid=${message.sid}`);

      let otp: string | null = null;
      try {
        otp = extractOTP(body, { otpPattern: options.otpPattern });
      } catch (err) {
        throw OTPErrorFactory.extractionFailed(
          {
            provider: 'sms',
            operation: 'extractOTP',
            sampleText: body.slice(0, 200),
            expectedFormat: options.otpPattern?.toString() ?? 'default 4-8 digit pattern',
          },
          err,
        );
      }

      if (otp !== null) {
        debug(`OTP found: ${otp}`);
        return { otp, source: 'sms:twilio', provider: 'sms', fetchedAt: new Date().toISOString() };
      }
    }

    const remaining = timeout - (Date.now() - startAt);
    if (remaining <= 0) break;
    debug(`OTP not found, waiting ${pollInterval}ms`);
    await sleep(Math.min(pollInterval, remaining));
  }

  throw OTPErrorFactory.timeout({
    provider: 'sms',
    operation: 'fetchSMSOTP',
    timeoutMs: timeout,
    attemptsMade,
    elapsedMs: Date.now() - startAt,
    extra: { smsProvider: 'twilio', maskedTo },
  });
}

function classifyTwilioError(err: unknown, attempt: number): OTPNinjaError {
  if (err instanceof OTPNinjaError) return err;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const twilioErr = err as any;
  const status: number | undefined = twilioErr?.status ?? twilioErr?.statusCode;
  const code: number | undefined = twilioErr?.code;
  const message: string = twilioErr?.message ?? String(err);

  if (status === 401 || status === 403) {
    return OTPErrorFactory.authFailed(
      {
        provider: 'sms',
        operation: 'listMessages',
        attemptsMade: attempt,
        httpStatus: status,
        providerCode: code,
      },
      err instanceof Error ? err : undefined,
    );
  }

  if (status === 429) {
    const retryAfter = twilioErr?.headers?.['retry-after'];
    return OTPErrorFactory.rateLimited(
      {
        provider: 'sms',
        operation: 'listMessages',
        httpStatus: status,
        providerCode: code,
        retryAfterMs: retryAfter ? parseInt(retryAfter, 10) * 1000 : 30_000,
      },
      err instanceof Error ? err : undefined,
    );
  }

  if (status !== undefined && status >= 500) {
    return OTPErrorFactory.providerError(message, {
      provider: 'sms',
      operation: 'listMessages',
      httpStatus: status,
      providerCode: code,
    }, err instanceof Error ? err : undefined);
  }

  return OTPErrorFactory.fromUnknown(err, 'sms', 'listMessages');
}

// ---------------------------------------------------------------------------
// Vonage
// ---------------------------------------------------------------------------

interface VonageMessageRecord {
  body: { text?: string };
  message_id: string;
}

async function fetchViaVonage(options: VonageSMSOptions): Promise<OTPExtractionResult> {
  validateVonageConfig({
    apiKey: options.apiKey,
    apiSecret: options.apiSecret,
    to: options.to,
    timeout: options.timeout,
    pollInterval: options.pollInterval,
  });

  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
  const maskedTo = maskPhone(options.to);

  debug(`Starting Vonage SMS poll for ${maskedTo}`);

  const startAt = Date.now();
  let attemptsMade = 0;

  // Vonage inbound messages endpoint
  const endpoint = `https://rest.nexmo.com/search/messages?api_key=${options.apiKey}&api_secret=${options.apiSecret}&to=${options.to}&type=MT`;

  while (Date.now() - startAt < timeout) {
    attemptsMade++;
    debug(`Poll attempt #${attemptsMade}`);

    let data: { items?: VonageMessageRecord[]; count?: number };
    try {
      const res = await fetch(endpoint);
      if (!res.ok) {
        const classified = classifyVonageHttpError(res.status, attemptsMade);
        if (!classified.isRetryable) throw classified;
        debug(`Retryable Vonage HTTP error ${res.status} on attempt #${attemptsMade}`);
        await sleep(Math.min(pollInterval, timeout - (Date.now() - startAt)));
        continue;
      }
      data = await res.json() as { items?: VonageMessageRecord[]; count?: number };
    } catch (err) {
      if (err instanceof OTPNinjaError) throw err;
      const networkErr = OTPErrorFactory.networkError(
        { provider: 'sms', operation: 'vonageFetch', attemptsMade },
        err instanceof Error ? err : undefined,
      );
      if (!networkErr.isRetryable) throw networkErr;
      debug(`Network error on attempt #${attemptsMade}:`, err);
      await sleep(Math.min(pollInterval, timeout - (Date.now() - startAt)));
      continue;
    }

    const messages = data.items ?? [];
    debug(`Received ${messages.length} message(s) from Vonage`);

    for (const message of messages) {
      const body = message.body?.text ?? '';
      let otp: string | null = null;
      try {
        otp = extractOTP(body, { otpPattern: options.otpPattern });
      } catch (err) {
        throw OTPErrorFactory.extractionFailed({
          provider: 'sms',
          operation: 'extractOTP',
          sampleText: body.slice(0, 200),
          expectedFormat: options.otpPattern?.toString() ?? 'default 4-8 digit pattern',
        }, err);
      }

      if (otp !== null) {
        debug(`OTP found: ${otp}`);
        return { otp, source: 'sms:vonage', provider: 'sms', fetchedAt: new Date().toISOString() };
      }
    }

    const remaining = timeout - (Date.now() - startAt);
    if (remaining <= 0) break;
    debug(`OTP not found, waiting ${pollInterval}ms`);
    await sleep(Math.min(pollInterval, remaining));
  }

  throw OTPErrorFactory.timeout({
    provider: 'sms',
    operation: 'fetchSMSOTP',
    timeoutMs: timeout,
    attemptsMade,
    elapsedMs: Date.now() - startAt,
    extra: { smsProvider: 'vonage', maskedTo },
  });
}

function classifyVonageHttpError(status: number, attempt: number): OTPNinjaError {
  if (status === 401 || status === 403) {
    return OTPErrorFactory.authFailed({
      provider: 'sms',
      operation: 'vonageFetch',
      httpStatus: status,
      attemptsMade: attempt,
    });
  }
  if (status === 429) {
    return OTPErrorFactory.rateLimited({
      provider: 'sms',
      operation: 'vonageFetch',
      httpStatus: status,
      retryAfterMs: 30_000,
    });
  }
  if (status >= 500) {
    return OTPErrorFactory.providerError(
      `Vonage API returned HTTP ${status}`,
      { provider: 'sms', operation: 'vonageFetch', httpStatus: status },
    );
  }
  return OTPErrorFactory.providerError(
    `Vonage API returned unexpected HTTP ${status}`,
    { provider: 'sms', operation: 'vonageFetch', httpStatus: status },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
