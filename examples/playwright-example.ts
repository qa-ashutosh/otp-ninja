/**
 * otp-ninja — Playwright Integration Example
 *
 * Run with: OTP_NINJA_DEBUG=true npx ts-node examples/playwright-example.ts
 *
 * Prerequisites:
 *   npm install @playwright/test
 *   npx playwright install chromium
 */

import { test, expect } from '@playwright/test';
import {
  fetchEmailOTP,
  gmailConfig,
  generateFreshTOTP,
  isOTPError,
} from '@ashforge/otp-ninja';

// ---------------------------------------------------------------------------
// Email OTP test — login flow that sends an OTP to email
// ---------------------------------------------------------------------------

test('completes email OTP login', async ({ page }) => {
  await page.goto('https://your-app.com/login');

  await page.fill('[data-testid="email"]', process.env['QA_EMAIL']!);
  await page.fill('[data-testid="password"]', process.env['QA_PASSWORD']!);
  await page.click('[data-testid="sign-in"]');

  // Wait for OTP input to appear
  await page.waitForSelector('[data-testid="otp-input"]');

  // Fetch the OTP from email — polling and retry handled automatically
  let otp: string;
  try {
    const result = await fetchEmailOTP(
      gmailConfig(
        {
          user: process.env['QA_EMAIL']!,
          password: process.env['GMAIL_APP_PASSWORD']!,
        },
        {
          from: 'no-reply@your-app.com',
          timeout: 30_000,
        },
      ),
    );
    otp = result.otp;
  } catch (err) {
    if (isOTPError(err)) {
      // Structured diagnostic — safe to log in CI
      console.error(err.toDiagnosticString());
    }
    throw err;
  }

  await page.fill('[data-testid="otp-input"]', otp);
  await page.click('[data-testid="verify-btn"]');

  await expect(page).toHaveURL('/dashboard');
});

// ---------------------------------------------------------------------------
// TOTP test — 2FA login with authenticator app secret
// ---------------------------------------------------------------------------

test('completes TOTP 2FA login', async ({ page }) => {
  await page.goto('https://your-app.com/login');

  await page.fill('[data-testid="email"]', process.env['QA_EMAIL']!);
  await page.fill('[data-testid="password"]', process.env['QA_PASSWORD']!);
  await page.click('[data-testid="sign-in"]');

  await page.waitForSelector('[data-testid="totp-input"]');

  // generateFreshTOTP waits for a new window if the current token expires in < 5s
  // This prevents flaky tests that submit right at a 30-second boundary
  const { otp, remainingSeconds } = await generateFreshTOTP({
    secret: process.env['TOTP_SECRET']!,
  });

  console.log(`TOTP: ${otp} (${remainingSeconds}s remaining)`);

  await page.fill('[data-testid="totp-input"]', otp);
  await page.click('[data-testid="verify-btn"]');

  await expect(page).toHaveURL('/dashboard');
});
