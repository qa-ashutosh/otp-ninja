/**
 * otp-ninja — Polling Engine
 *
 * Generic polling loop used by email and SMS providers.
 * Callers provide a fetch function; the poller handles timing, retries, and timeout.
 */

import { OTPErrorFactory, OTPNinjaError, type OTPProvider } from './errors';

export interface PollerOptions {
  timeout: number;
  pollInterval: number;
  provider: OTPProvider;
  operation: string;
}

/**
 * Poll a fetch function until it returns a non-null result or the timeout expires.
 *
 * The fetch function should:
 *  - Return a value when successful
 *  - Return null to signal "not found yet, retry"
 *  - Throw an OTPNinjaError with isRetryable=false to abort immediately
 *  - Throw an OTPNinjaError with isRetryable=true to log and continue
 *
 * @throws {OTPTimeoutError}  When timeout expires without a result.
 */
export async function poll<T>(
  fetchFn: (attempt: number) => Promise<T | null>,
  options: PollerOptions,
): Promise<T> {
  const { timeout, pollInterval, provider, operation } = options;
  const startAt = Date.now();
  let attemptsMade = 0;

  while (Date.now() - startAt < timeout) {
    attemptsMade++;

    try {
      const result = await fetchFn(attemptsMade);
      if (result !== null) return result;
    } catch (err) {
      if (err instanceof OTPNinjaError && !err.isRetryable) throw err;
      // Retryable — fall through to next iteration
    }

    const remaining = timeout - (Date.now() - startAt);
    if (remaining <= 0) break;
    await sleep(Math.min(pollInterval, remaining));
  }

  throw OTPErrorFactory.timeout({
    provider,
    operation,
    timeoutMs: timeout,
    attemptsMade,
    elapsedMs: Date.now() - startAt,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
