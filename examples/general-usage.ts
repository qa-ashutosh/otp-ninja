/**
 * otp-ninja — General Usage Examples
 *
 * Run with: OTP_NINJA_DEBUG=true npx ts-node examples/general-usage.ts
 *
 * Set up your .env file first — see .env.example
 */

import 'dotenv/config';
import {
  fetchOTP,
  fetchEmailOTP,
  fetchSMSOTP,
  generateTOTP,
  generateFreshTOTP,
  verifyTOTP,
  extractOTP,
  gmailConfig,
  outlookConfig,
  isOTPError,
  isOTPErrorCode,
} from '@ashforge/otp-ninja';

// ---------------------------------------------------------------------------
// Email OTP — Gmail
// ---------------------------------------------------------------------------

async function emailExample(): Promise<void> {
  console.log('\n--- Email OTP (Gmail) ---');

  try {
    const { otp, fetchedAt } = await fetchEmailOTP(
      gmailConfig({
        user: process.env['GMAIL_USER']!,
        password: process.env['GMAIL_APP_PASSWORD']!,
      }, {
        from: 'no-reply@yourapp.com',
        timeout: 30_000,
        pollInterval: 3_000,
      }),
    );

    console.log(`OTP: ${otp}`);
    console.log(`Fetched at: ${fetchedAt}`);
  } catch (err) {
    handleError(err);
  }
}

// ---------------------------------------------------------------------------
// Email OTP — Outlook
// ---------------------------------------------------------------------------

async function outlookExample(): Promise<void> {
  console.log('\n--- Email OTP (Outlook) ---');

  try {
    const { otp } = await fetchEmailOTP(
      outlookConfig({
        user: process.env['OUTLOOK_USER']!,
        password: process.env['OUTLOOK_APP_PASSWORD']!,
      }),
    );
    console.log(`OTP: ${otp}`);
  } catch (err) {
    handleError(err);
  }
}

// ---------------------------------------------------------------------------
// SMS OTP — Twilio
// ---------------------------------------------------------------------------

async function twilioExample(): Promise<void> {
  console.log('\n--- SMS OTP (Twilio) ---');

  try {
    const { otp } = await fetchSMSOTP({
      provider: 'twilio',
      accountSid: process.env['TWILIO_ACCOUNT_SID']!,
      authToken: process.env['TWILIO_AUTH_TOKEN']!,
      to: '+14155552671',
      timeout: 30_000,
    });
    console.log(`OTP: ${otp}`);
  } catch (err) {
    handleError(err);
  }
}

// ---------------------------------------------------------------------------
// SMS OTP — Vonage
// ---------------------------------------------------------------------------

async function vonageExample(): Promise<void> {
  console.log('\n--- SMS OTP (Vonage) ---');

  try {
    const { otp } = await fetchSMSOTP({
      provider: 'vonage',
      apiKey: process.env['VONAGE_API_KEY']!,
      apiSecret: process.env['VONAGE_API_SECRET']!,
      to: '+14155552671',
      timeout: 30_000,
    });
    console.log(`OTP: ${otp}`);
  } catch (err) {
    handleError(err);
  }
}

// ---------------------------------------------------------------------------
// TOTP
// ---------------------------------------------------------------------------

async function totpExample(): Promise<void> {
  console.log('\n--- TOTP ---');

  const secret = process.env['TOTP_SECRET'] ?? 'JBSWY3DPEHPK3PXP';

  // Basic generation
  const { otp, remainingSeconds, isExpiring } = generateTOTP({ secret });
  console.log(`Current TOTP: ${otp} (${remainingSeconds}s remaining, expiring: ${isExpiring})`);

  // Fresh token — guaranteed valid for at least 5 seconds
  const fresh = await generateFreshTOTP({ secret });
  console.log(`Fresh TOTP:   ${fresh.otp} (${fresh.remainingSeconds}s remaining)`);

  // Verify
  const valid = verifyTOTP(otp, { secret });
  console.log(`Verified: ${valid}`);
}

// ---------------------------------------------------------------------------
// Standalone OTP extraction
// ---------------------------------------------------------------------------

function extractionExample(): void {
  console.log('\n--- Standalone OTP Extraction ---');

  // Plain text
  const r1 = extractOTP('Your verification code is 482910');
  console.log(`Plain text: ${r1}`); // "482910"

  // HTML email body
  const html = '<p>Your <strong>code</strong>: <span>382910</span></p>';
  const r2 = extractOTP(html);
  console.log(`HTML body: ${r2}`); // "382910"

  // Custom regex for non-standard format
  const r3 = extractOTP('Use token XK-38291 to sign in', {
    otpPattern: /token\s+([A-Z]{2}-\d{5})/i,
  });
  console.log(`Custom pattern: ${r3}`); // "XK-38291"

  // Returns null when nothing matches (no throw)
  const r4 = extractOTP('Hello, welcome aboard!');
  console.log(`No match: ${r4}`); // null
}

// ---------------------------------------------------------------------------
// Universal fetchOTP entry point
// ---------------------------------------------------------------------------

async function universalExample(): Promise<void> {
  console.log('\n--- Universal fetchOTP ---');

  // All three provider types through a single function
  const totp = await fetchOTP({
    type: 'totp',
    secret: process.env['TOTP_SECRET'] ?? 'JBSWY3DPEHPK3PXP',
  });
  console.log(`TOTP via fetchOTP: ${totp.otp}`);
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

function handleError(err: unknown): void {
  if (isOTPError(err)) {
    // Full diagnostic block — safe to log anywhere, credentials masked
    console.error(err.toDiagnosticString());

    // Type-specific handling
    if (isOTPErrorCode(err, 'MISSING_DEPENDENCY')) {
      console.error(`Run: ${err.installCommand}`);
    }

    if (isOTPErrorCode(err, 'TIMEOUT')) {
      console.error('Try increasing the timeout option.');
    }

    if (err.isRetryable) {
      console.error('This error is retryable — check your network and try again.');
    }

    if (err.isUserError) {
      console.error('This is a configuration issue — check the steps above.');
    }
  } else {
    console.error('Unexpected error:', err);
  }
}

// ---------------------------------------------------------------------------
// Run all examples
// ---------------------------------------------------------------------------

(async () => {
  extractionExample();
  await totpExample();
  await universalExample();

  // Uncomment these when you have real credentials set in .env:
  // await emailExample();
  // await outlookExample();
  // await twilioExample();
  // await vonageExample();
})().catch(console.error);