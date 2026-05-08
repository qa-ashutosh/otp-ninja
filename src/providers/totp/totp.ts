/**
 * otp-ninja — TOTP Provider (RFC 6238, pure Node.js crypto)
 *
 * Error handling contract:
 *  - validateTOTPConfig() runs eagerly — wrong secret format detected immediately.
 *  - TOTP generation uses only Node.js built-in `crypto` — zero peer deps, zero
 *    runtime errors from missing packages.
 *  - OTPExtractionError thrown if the generated token is empty or malformed (should
 *    never happen with valid config, but guards against crypto edge cases).
 *  - verifyTOTP() never throws — returns boolean only.
 *  - generateFreshTOTP() guarantees the token has at least `minSecondsRemaining`
 *    validity to avoid flaky tests that run right at a 30s boundary.
 */

import { createHmac } from 'crypto';
import {
  OTPErrorFactory,
  type OTPProvider,
} from '../../core/errors';
import { validateTOTPConfig } from '../../core/validator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TOTPAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

export interface TOTPOptions {
  /** Base32-encoded shared secret from your authenticator app or QR code. */
  secret: string;
  /** Number of digits in the OTP. Default: 6. */
  digits?: number;
  /** Token validity period in seconds. Default: 30. */
  period?: number;
  /** HMAC algorithm. Default: SHA1 (standard). */
  algorithm?: TOTPAlgorithm;
  /** Issuer label — used only for labelling, not computation. */
  issuer?: string;
}

export interface TOTPResult {
  otp: string;
  provider: OTPProvider;
  fetchedAt: string;
  remainingSeconds: number;
  isExpiring: boolean;
  period: number;
  digits: number;
}

const PROVIDER: OTPProvider = 'totp';
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD = 30;
const DEFAULT_ALGORITHM: TOTPAlgorithm = 'SHA1';
/** generateFreshTOTP() will wait for a new token if fewer seconds remain than this. */
const DEFAULT_MIN_SECONDS_REMAINING = 5;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a TOTP token for the current time window.
 *
 * @throws {OTPInvalidConfigError}  If the secret or other options are invalid.
 * @throws {OTPExtractionError}     If the generated token is unexpectedly empty (rare).
 */
export function generateTOTP(options: TOTPOptions): TOTPResult {
  validateTOTPConfig({
    secret: options.secret,
    digits: options.digits,
    period: options.period,
    algorithm: options.algorithm,
    issuer: options.issuer,
  });

  const digits = options.digits ?? DEFAULT_DIGITS;
  const period = options.period ?? DEFAULT_PERIOD;
  const algorithm = options.algorithm ?? DEFAULT_ALGORITHM;
  const nowSeconds = Math.floor(Date.now() / 1000);

  const token = computeTOTP(options.secret, digits, period, algorithm, nowSeconds);

  if (!token || token.length !== digits) {
    throw OTPErrorFactory.extractionFailed({
      provider: PROVIDER,
      operation: 'generateTOTP',
      expectedFormat: `${digits}-digit numeric token`,
      extra: {
        generatedLength: token?.length ?? 0,
        digits,
        algorithm,
      },
    });
  }

  const remainingSeconds = period - (nowSeconds % period);
  const isExpiring = remainingSeconds <= DEFAULT_MIN_SECONDS_REMAINING;

  return {
    otp: token,
    provider: PROVIDER,
    fetchedAt: new Date().toISOString(),
    remainingSeconds,
    isExpiring,
    period,
    digits,
  };
}

/**
 * Generate a TOTP token guaranteed to have at least `minSecondsRemaining` validity.
 *
 * Use this in tests where a near-expiry token could cause a race condition between
 * generation and form submission.
 *
 * @param options         Standard TOTP options.
 * @param minSecondsRemaining  Minimum seconds the token must still be valid for. Default: 5.
 *
 * @throws {OTPInvalidConfigError}  If config is invalid.
 */
export async function generateFreshTOTP(
  options: TOTPOptions,
  minSecondsRemaining = DEFAULT_MIN_SECONDS_REMAINING,
): Promise<TOTPResult> {
  // Validate once — not per-poll
  validateTOTPConfig({
    secret: options.secret,
    digits: options.digits,
    period: options.period,
    algorithm: options.algorithm,
    issuer: options.issuer,
  });

  const period = options.period ?? DEFAULT_PERIOD;
  const waitLimit = period * 1000 + 1000; // never wait more than one full period + 1s
  const startAt = Date.now();

  // eslint-disable-next-line no-constant-condition
  for (;;) {
    const result = generateTOTP(options);

    if (result.remainingSeconds >= minSecondsRemaining) {
      return result;
    }

    const waitMs = (result.remainingSeconds + 1) * 1000;
    if (Date.now() - startAt + waitMs > waitLimit) {
      // Safety guard — this should never trigger in practice
      throw OTPErrorFactory.timeout({
        provider: PROVIDER,
        operation: 'generateFreshTOTP',
        timeoutMs: waitLimit,
        elapsedMs: Date.now() - startAt,
        extra: { minSecondsRemaining, remainingSeconds: result.remainingSeconds },
      });
    }

    await sleep(waitMs);
  }
}

/**
 * Verify whether a given TOTP token is valid for the current (or adjacent) time window.
 * Accepts the current window plus one window each side to account for clock drift.
 *
 * Never throws. Returns true if valid, false otherwise.
 */
export function verifyTOTP(token: string, options: TOTPOptions): boolean {
  try {
    validateTOTPConfig({
      secret: options.secret,
      digits: options.digits,
      period: options.period,
      algorithm: options.algorithm,
    });
  } catch {
    return false; // invalid config — cannot verify
  }

  const digits = options.digits ?? DEFAULT_DIGITS;
  const period = options.period ?? DEFAULT_PERIOD;
  const algorithm = options.algorithm ?? DEFAULT_ALGORITHM;
  const nowSeconds = Math.floor(Date.now() / 1000);

  // Check current window and one window each side (±1 drift allowance)
  for (const drift of [-1, 0, 1]) {
    const candidate = computeTOTP(options.secret, digits, period, algorithm, nowSeconds + drift * period);
    if (candidate === token) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Core RFC 6238 computation
// ---------------------------------------------------------------------------

/**
 * Compute a TOTP token for a given Unix timestamp.
 * Pure function — no side effects, no I/O.
 */
function computeTOTP(
  secret: string,
  digits: number,
  period: number,
  algorithm: TOTPAlgorithm,
  unixSeconds: number,
): string {
  const key = decodeBase32(secret);
  const counter = Math.floor(unixSeconds / period);

  // Counter as 8-byte big-endian buffer
  const counterBuf = Buffer.alloc(8);
  const hi = Math.floor(counter / 0x100000000);
  const lo = counter >>> 0;
  counterBuf.writeUInt32BE(hi, 0);
  counterBuf.writeUInt32BE(lo, 4);

  // HMAC
  const nodeAlg = algorithm.toLowerCase().replace('-', ''); // SHA1, SHA256 → sha1, sha256
  const hmac = createHmac(nodeAlg, key).update(counterBuf).digest();

  // Dynamic truncation — safe buffer reads with fallback to 0
  const lastByte = hmac[hmac.length - 1] ?? 0;
  const offset = lastByte & 0x0f;
  const binCode =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);

  const otp = binCode % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

// ---------------------------------------------------------------------------
// Base32 decoder — RFC 4648, no external deps
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Decode a Base32 string to a Buffer.
 * Handles upper/lowercase, strips whitespace and = padding.
 *
 * @throws {OTPInvalidConfigError}  If the string contains invalid Base32 characters.
 */
function decodeBase32(input: string): Buffer {
  const cleaned = input.replace(/\s/g, '').toUpperCase().replace(/=+$/, '');

  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i] ?? '';
    const idx = BASE32_ALPHABET.indexOf(char);

    if (idx === -1) {
      throw OTPErrorFactory.invalidConfig(
        `TOTP secret contains invalid Base32 character "${char}" at position ${i}. Valid characters are A–Z and 2–7.`,
        ['secret'],
        { provider: PROVIDER, operation: 'decodeBase32' },
      );
    }

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
