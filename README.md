<div align="center">

<h1>🥷 otp-ninja</h1>

<p><strong>The unified OTP toolkit built for QA automation engineers.</strong><br />Email · SMS · TOTP. One package. Zero compromise.</p>

<br />

[![npm version](https://img.shields.io/npm/v/@ashforge%2Fotp-ninja?style=flat-square&color=00d26a&label=npm)](https://www.npmjs.com/package/@ashforge/otp-ninja)
[![npm downloads](https://img.shields.io/npm/dm/@ashforge%2Fotp-ninja?style=flat-square&color=00d26a)](https://www.npmjs.com/package/@ashforge/otp-ninja)
[![CI](https://img.shields.io/github/actions/workflow/status/qa-ashutosh/otp-ninja/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/qa-ashutosh/otp-ninja/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow?style=flat-square)](./LICENSE)
[![Node.js >= 16](https://img.shields.io/badge/node-%3E%3D16-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org)
[![Zero warnings](https://img.shields.io/badge/npm_install-zero_warnings-success?style=flat-square)](https://www.npmjs.com/package/@ashforge/otp-ninja)

<br />

</div>

---

## Why otp-ninja?

Testing OTP flows is painful. You juggle different libraries for email, SMS, and TOTP. You copy-paste polling loops. You guess why an OTP wasn't found. You waste hours debugging cryptic provider errors with zero context.

**otp-ninja fixes all of that.**

One package. Three providers. Smart retry built in. TypeScript-first. And when something goes wrong, it tells you exactly what to fix, not just that something broke.

```typescript
import { fetchOTP } from '@ashforge/otp-ninja';

// Fetch an email OTP with polling and retry handled automatically
const { otp } = await fetchOTP({
  type: 'email',
  host: 'imap.gmail.com',
  user: 'qa-bot@yourcompany.com',
  password: process.env.GMAIL_APP_PASSWORD!,
  from: 'no-reply@yourapp.com',
  timeout: 30_000,
});

await page.fill('[data-testid="otp-input"]', otp);
```

---

## Feature Overview

| Capability | Details |
|---|---|
| Email OTP | Gmail, Outlook, Yahoo, iCloud, Fastmail, any IMAP server |
| SMS OTP | Twilio & Vonage support with install-only-what-you-need flexibility |
| TOTP | RFC 6238, pure Node.js crypto with zero external deps |
| Smart retry | Configurable timeout and poll interval with no manual loops |
| Extraction engine | Plain text, HTML, quoted-printable, custom regex |
| TypeScript | Strict mode, full IntelliSense, zero `any` |
| Error handling | Typed errors with recovery steps built in |
| Framework support | Playwright, Cypress, WebdriverIO, Jest, plain Node.js |
| Security | Credentials never logged, TLS enforced by default |
| Bundle size | Minimal, only `imapflow` is a hard dependency |

---

## Installation

```bash
npm install @ashforge/otp-ninja
```

For SMS via Twilio (optional peer dependency):

```bash
npm install @ashforge/otp-ninja twilio
```

For SMS via Vonage, no extra install needed, Vonage uses a direct REST call.

**Node.js 16 or higher is required.**

---

## Quick Start

### Email OTP

```typescript
import { fetchEmailOTP, gmailConfig } from '@ashforge/otp-ninja';

const { otp } = await fetchEmailOTP(
  gmailConfig({
    user: 'qa-bot@gmail.com',
    password: process.env.GMAIL_APP_PASSWORD!,
  }, {
    from: 'no-reply@yourapp.com',
    timeout: 30_000,
  })
);

console.log('OTP:', otp); // "429817"
```

### SMS OTP

```typescript
import { fetchSMSOTP } from '@ashforge/otp-ninja';

const { otp } = await fetchSMSOTP({
  provider: 'twilio',
  accountSid: process.env.TWILIO_SID!,
  authToken: process.env.TWILIO_TOKEN!,
  to: '+14155552671',
  timeout: 30_000,
});
```

### TOTP (Authenticator Apps)

```typescript
import { generateTOTP, generateFreshTOTP, verifyTOTP } from '@ashforge/otp-ninja';

// Generate current token
const { otp, remainingSeconds } = generateTOTP({
  secret: process.env.TOTP_SECRET!, // Base32 from your app's QR code
});

// Generate a token guaranteed to be valid for at least 5 more seconds
// Prevents flaky tests that submit right at a 30s window boundary
const { otp: freshOtp } = await generateFreshTOTP({ secret: process.env.TOTP_SECRET! });

// Verify a token (returns boolean, never throws)
const valid = verifyTOTP('429817', { secret: process.env.TOTP_SECRET! });
```

### Universal Entry Point

```typescript
import { fetchOTP } from '@ashforge/otp-ninja';

// Email
await fetchOTP({ type: 'email', host: 'imap.gmail.com', user: '...', password: '...' });

// SMS
await fetchOTP({ type: 'sms', provider: 'twilio', accountSid: '...', authToken: '...', to: '...' });

// TOTP
await fetchOTP({ type: 'totp', secret: '...' });
```

---

## Email Providers

### Gmail

Gmail requires an **App Password**, not your regular Gmail password.

1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Click "Select app" and choose "Mail"
3. Click "Select device" and choose "Other (custom name)", then name it `otp-ninja`
4. Copy the 16-character generated password. This is your `password` value

```typescript
import { gmailConfig } from '@ashforge/otp-ninja';

const config = gmailConfig({
  user: 'qa-bot@gmail.com',
  password: 'abcd efgh ijkl mnop', // the 16-char App Password (spaces are fine)
}, {
  from: 'no-reply@yourapp.com',
  timeout: 45_000,
});
```

### Outlook / Office 365

```typescript
import { outlookConfig } from '@ashforge/otp-ninja';

const config = outlookConfig({
  user: 'qa-bot@yourcompany.com',
  password: process.env.OUTLOOK_APP_PASSWORD!,
});
```

**Corporate Outlook note:** Many organisations disable IMAP access by default. If you receive a connection error, ask your IT administrator to enable IMAP for your mailbox, or check Outlook Settings → Mail → Sync email → IMAP.

### Yahoo, iCloud, Fastmail, Zoho

```typescript
import { fetchEmailOTP, EMAIL_PROVIDERS } from '@ashforge/otp-ninja';

// Yahoo
await fetchEmailOTP({
  ...EMAIL_PROVIDERS.yahoo,
  user: 'qa-bot@yahoo.com',
  password: process.env.YAHOO_APP_PASSWORD!,
});

// iCloud
await fetchEmailOTP({
  ...EMAIL_PROVIDERS.icloud,
  user: 'qa-bot@icloud.com',
  password: process.env.ICLOUD_APP_PASSWORD!,
});

// Fastmail
await fetchEmailOTP({
  ...EMAIL_PROVIDERS.fastmail,
  user: 'qa-bot@fastmail.com',
  password: process.env.FASTMAIL_APP_PASSWORD!,
});
```

### Custom IMAP Server

```typescript
await fetchEmailOTP({
  host: 'mail.yourcompany.com',
  port: 993,
  tls: true,
  user: 'qa-bot@yourcompany.com',
  password: process.env.IMAP_PASSWORD!,
  from: 'otp@yourapp.com',
  timeout: 30_000,
});
```

### Mailinator (Public Inboxes)

Mailinator provides a free public email API with no IMAP required, no account needed. Read up to 100 messages per day on the free tier.

```typescript
import { fetchEmailOTP, extractOTP } from '@ashforge/otp-ninja';

// Mailinator uses an HTTP API instead of IMAP, so use `extractOTP()` on the response.
const response = await fetch(
  'https://www.mailinator.com/api/v2/domains/mailinator.com/inboxes/test-inbox/messages',
  { headers: { Authorization: `Bearer ${process.env.MAILINATOR_TOKEN}` } }
);
const data = await response.json();
const latestBody = data.msgs?.[0]?.parts?.[0]?.body ?? '';
const { otp } = extractOTP(latestBody);
```

---

## SMS Providers

### Twilio

```typescript
import { fetchSMSOTP } from '@ashforge/otp-ninja';

// Install first: npm install twilio
const { otp } = await fetchSMSOTP({
  provider: 'twilio',
  accountSid: process.env.TWILIO_ACCOUNT_SID!,  // starts with "AC"
  authToken: process.env.TWILIO_AUTH_TOKEN!,
  to: '+14155552671',
  timeout: 30_000,
  pollInterval: 5_000,
});
```

**Twilio free trial note:** Trial accounts can only send SMS to verified phone numbers. Verify your test number at [console.twilio.com](https://console.twilio.com).

### Vonage

No extra install is needed because Vonage uses a direct REST API call.

```typescript
const { otp } = await fetchSMSOTP({
  provider: 'vonage',
  apiKey: process.env.VONAGE_API_KEY!,
  apiSecret: process.env.VONAGE_API_SECRET!,
  to: '+14155552671',
  timeout: 30_000,
});
```

---

## TOTP for Authenticator Apps

otp-ninja implements RFC 6238 TOTP from scratch using Node.js built-in `crypto`. No external dependencies. Compatible with Google Authenticator, Authy, Microsoft Authenticator, 1Password, and Bitwarden.

```typescript
import { generateTOTP, generateFreshTOTP, verifyTOTP } from '@ashforge/otp-ninja';

// Basic generation
const { otp, remainingSeconds, isExpiring } = generateTOTP({
  secret: 'JBSWY3DPEHPK3PXP', // Base32 secret from your app
  digits: 6,    // optional, default 6
  period: 30,   // optional, default 30 seconds
  algorithm: 'SHA1', // optional, default SHA1
});

// Use generateFreshTOTP() in tests to avoid race conditions
// It waits for a new window if the current token expires in < 5 seconds
const { otp: safeOtp } = await generateFreshTOTP({ secret: process.env.TOTP_SECRET! });

// Verify with accepts ±1 window drift for clock skew
const isValid = verifyTOTP('429817', { secret: process.env.TOTP_SECRET! });
```

**Finding your TOTP secret:** Scan the QR code displayed during 2FA setup and extract the `secret` query parameter from the `otpauth://` URI. Many apps let you view this via "Show key" or "Can't scan QR code" options.

---

## OTP Extraction Engine

Use `extractOTP()` standalone when you already have message text and just need the OTP pulled out.

```typescript
import { extractOTP } from '@ashforge/otp-ninja';

// Default matcher for 4–8 digit codes preceded by OTP-related keywords
const result = extractOTP('Your verification code is 482910');
// result.otp === "482910"

// Custom regex for non-standard OTP formats
const result2 = extractOTP('Use token XK-38291 to continue', {
  otpPattern: /token\s+([A-Z]{2}-\d{5})/i,
});
// result2.otp === "XK-38291"

// Extract from HTML email bodies with automatic quoted-printable decoding
const result3 = extractOTP(htmlEmailBody);
```

---

## Polling and Retry

Every provider uses the same polling engine. You configure `timeout` and `pollInterval`, and otp-ninja handles the rest.

```typescript
await fetchEmailOTP({
  // ... connection config ...
  timeout: 60_000,     // keep polling for up to 60 seconds
  pollInterval: 3_000, // check every 3 seconds
});
```

The poller:

1. Connects and searches for matching messages
2. If found, extracts the OTP and returns immediately
3. If not found, waits `pollInterval` milliseconds and tries again
4. When `timeout` is exceeded, throws `OTPTimeoutError` with the elapsed time and attempt count

**Tip:** Start with `timeout: 30_000` for most providers. Increase to `60_000` if your OTP sender is known to be slow, or if tests run in CI where networks can be less predictable.

---

## Framework Integration

### Playwright

```typescript
// tests/helpers/otp.ts
import { fetchEmailOTP, gmailConfig, generateFreshTOTP } from '@ashforge/otp-ninja';

export async function getEmailOTP(): Promise<string> {
  const { otp } = await fetchEmailOTP(
    gmailConfig({ user: process.env.QA_EMAIL!, password: process.env.GMAIL_APP_PASSWORD! })
  );
  return otp;
}

export async function getTOTP(): Promise<string> {
  const { otp } = await generateFreshTOTP({ secret: process.env.TOTP_SECRET! });
  return otp;
}

// tests/login.spec.ts
import { test, expect } from '@playwright/test';
import { getEmailOTP, getTOTP } from './helpers/otp';

test('completes 2FA login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#email', process.env.QA_EMAIL!);
  await page.fill('#password', process.env.QA_PASSWORD!);
  await page.click('#sign-in');

  const otp = await getEmailOTP();
  await page.fill('[data-testid="otp-input"]', otp);
  await page.click('[data-testid="verify-btn"]');

  await expect(page).toHaveURL('/dashboard');
});
```

See [`examples/playwright-example.ts`](./examples/playwright-example.ts) for the full working example.

### Cypress

```typescript
// cypress/support/commands.ts
import { fetchEmailOTP, gmailConfig } from '@ashforge/otp-ninja';

Cypress.Commands.add('getEmailOTP', async () => {
  const { otp } = await fetchEmailOTP(
    gmailConfig({ user: Cypress.env('QA_EMAIL'), password: Cypress.env('GMAIL_APP_PASSWORD') })
  );
  return otp;
});

// cypress/e2e/login.cy.ts
cy.getEmailOTP().then((otp) => {
  cy.get('[data-testid="otp-input"]').type(otp);
  cy.get('[data-testid="verify-btn"]').click();
});
```

### WebdriverIO

```typescript
import { fetchEmailOTP, gmailConfig } from '@ashforge/otp-ninja';

describe('OTP login', () => {
  it('submits the OTP correctly', async () => {
    const { otp } = await fetchEmailOTP(
      gmailConfig({ user: process.env.QA_EMAIL!, password: process.env.GMAIL_APP_PASSWORD! })
    );
    await $('[data-testid="otp-input"]').setValue(otp);
    await $('[data-testid="verify-btn"]').click();
  });
});
```

### Jest / Node.js

```typescript
import { fetchEmailOTP, generateTOTP } from '@ashforge/otp-ninja';

test('email OTP is 6 digits', async () => {
  const { otp } = await fetchEmailOTP({ /* ... */ });
  expect(otp).toMatch(/^\d{6}$/);
});
```

---

## Error Handling

Every error thrown by otp-ninja is a typed `OTPNinjaError` with a machine-readable `code`, a plain-English message, and a built-in recovery guide.

```typescript
import { fetchEmailOTP, isOTPError, isOTPErrorCode } from 'otp-ninja';

try {
  const { otp } = await fetchEmailOTP({ /* ... */ });
} catch (err) {
  if (isOTPError(err)) {
    // Every error has these fields:
    console.log(err.code);       // 'TIMEOUT' | 'OTP_NOT_FOUND' | 'CONNECTION_FAILED' | ...
    console.log(err.provider);   // 'email' | 'sms' | 'totp'
    console.log(err.severity);   // 'retryable' | 'fatal' | 'user_error' | 'config_error'
    console.log(err.isRetryable);   // true if the caller can safely retry
    console.log(err.isUserError);   // true if the fix requires a config change

    // Full diagnostic block — credential-safe, log this anywhere
    console.log(err.toDiagnosticString());

    // Structured — compatible with Winston, Pino, Datadog, Splunk
    logger.error(err.toJSON());

    // Every error includes a recovery guide
    console.log(err.recovery.action);  // one-line instruction
    err.recovery.steps.forEach(step => console.log(step));
  }

  // Check for a specific error code
  if (isOTPErrorCode(err, 'TIMEOUT')) {
    // increase timeout and retry
  }

  if (isOTPErrorCode(err, 'MISSING_DEPENDENCY')) {
    console.log(err.installCommand); // exact npm install command
  }
}
```

### Error Code Reference

| Code | Class | Severity | Common Cause |
|---|---|---|---|
| `OTP_NOT_FOUND` | `OTPNotFoundError` | retryable | No matching message arrived yet |
| `TIMEOUT` | `OTPTimeoutError` | retryable | Polling exceeded timeout |
| `CONNECTION_FAILED` | `OTPConnectionError` | retryable | Wrong host/port or IMAP blocked |
| `AUTHENTICATION_FAILED` | `OTPAuthenticationError` | user_error | Wrong password or missing App Password |
| `INVALID_CONFIG` | `OTPInvalidConfigError` | config_error | Missing or malformed option |
| `EXTRACTION_FAILED` | `OTPExtractionError` | user_error | OTP pattern did not match message body |
| `MISSING_DEPENDENCY` | `OTPMissingDependencyError` | user_error | Peer dep (twilio) not installed |
| `PROVIDER_ERROR` | `OTPProviderError` | retryable | Provider API returned an error |
| `NETWORK_ERROR` | `OTPNetworkError` | retryable | Transient DNS/TLS/socket failure |
| `PERMISSION_DENIED` | `OTPPermissionError` | user_error | IMAP access rights issue |
| `RATE_LIMITED` | `OTPRateLimitError` | retryable | API rate limit exceeded |

### Example Diagnostic Output

When you call `err.toDiagnosticString()`, you get a structured, credential-free diagnostic block:

```
[otp-ninja] OTPTimeoutError: OTP polling timed out after 30s (10 poll(s) made).
  Code     : TIMEOUT
  Provider : email
  Severity : retryable
  Time     : 2024-11-15T09:42:18.221Z
  Operation: fetchEmailOTP
  Endpoint : imap.gmail.com
  Account  : ***@gmail.com
  Attempts : 10 / 10
  Elapsed  : 30012ms
  Timeout  : 30000ms

  What to do:
    Increase the timeout or check for delivery delays on the sending side.
    1. Your current timeout is 30s, try doubling it: { timeout: 60000 }.
    2. Check whether the OTP sender (email/SMS provider) is experiencing delays.
    3. Verify the trigger that sends the OTP actually fired (e.g. the login button was clicked).
    4. If testing locally, add a deliberate delay before calling fetchOTP to let the message arrive.
    5. Use OTP_NINJA_DEBUG=true to see polling activity in real time.
```

---

## Configuration Reference

### Email Options

| Option | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | required | IMAP server hostname |
| `port` | `number` | `993` | IMAP server port |
| `tls` | `boolean` | `true` | Use TLS (strongly recommended) |
| `user` | `string` | required | Email address for authentication |
| `password` | `string` | required | App Password (not your login password) |
| `from` | `string` | — | Filter by sender address. This must be the OTP sender, not your own address |
| `subject` | `string` | — | Filter by subject line (partial match) |
| `mailbox` | `string` | `'INBOX'` | IMAP mailbox/folder name |
| `timeout` | `number` | `30000` | Max polling duration in milliseconds |
| `pollInterval` | `number` | `3000` | Delay between polls in milliseconds |
| `otpPattern` | `RegExp` | built-in | Custom regex to extract the OTP |

### SMS Options (Twilio)

| Option | Type | Default | Description |
|---|---|---|---|
| `provider` | `'twilio'` | required | Select the Twilio provider |
| `accountSid` | `string` | required | Twilio Account SID (starts with `AC`) |
| `authToken` | `string` | required | Twilio Auth Token |
| `to` | `string` | required | Phone number that received the OTP (E.164 format) |
| `timeout` | `number` | `30000` | Max polling duration in milliseconds |
| `pollInterval` | `number` | `5000` | Delay between polls in milliseconds |
| `otpPattern` | `RegExp` | built-in | Custom regex to extract the OTP |

### TOTP Options

| Option | Type | Default | Description |
|---|---|---|---|
| `secret` | `string` | required | Base32-encoded shared secret |
| `digits` | `number` | `6` | Token length |
| `period` | `number` | `30` | Token validity in seconds |
| `algorithm` | `'SHA1' \| 'SHA256' \| 'SHA512'` | `'SHA1'` | HMAC algorithm |
| `issuer` | `string` | — | Label only. Not used in computation |

---

## Environment Variables

Store credentials in a `.env` file and load them with `dotenv` or your framework's built-in `.env` support.

```bash
# .env
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
OUTLOOK_APP_PASSWORD=your-app-password

TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token

TOTP_SECRET=JBS8IODPEHPK6HG7P

# Enable verbose debug logging (credentials are masked)
OTP_NINJA_DEBUG=true
```

```typescript
import 'dotenv/config';
import { fetchEmailOTP, gmailConfig } from '@ashforge/otp-ninja';

const { otp } = await fetchEmailOTP(
  gmailConfig({
    user: 'qa-bot@gmail.com',
    password: process.env.GMAIL_APP_PASSWORD!,
  })
);
```

See [`.env.example`](./.env.example) for the full template.

---

## Debug Mode

Set `OTP_NINJA_DEBUG=true` to enable verbose logging. All output is credential-safe, and passwords, tokens, and API keys are never printed.

```bash
OTP_NINJA_DEBUG=true node your-test.mjs
```

Debug output shows each poll attempt with its timestamp, the number of messages found per search, which message UIDs were inspected, the resolved configuration with sensitive fields masked, and the final OTP value when found.

---

## Security

otp-ninja treats credential safety as a hard requirement, not an afterthought.

**Credentials never appear in logs or error messages.** Every error context passes through `maskSensitive()` before anything is stored or printed. Email addresses are reduced to `***@domain.com`. Phone numbers are reduced to `***2671`. API keys, passwords, and tokens become `***`.

**TLS is enabled by default.** IMAP connections use TLS (`secure: true`) unless you explicitly set `tls: false`, which is only appropriate for local test mail servers.

**No credential persistence.** Nothing is cached, stored, or transmitted to any third party. Credentials flow directly to the provider (Gmail, Twilio, etc.) and nowhere else.

**Peer dependencies are optional.** Install only the provider SDKs your workflow actually needs. If you only use TOTP, you install zero provider dependencies.

See [`SECURITY.md`](./SECURITY.md) for the full security policy and responsible disclosure process.

---

## Examples

The [`examples/`](./examples/) directory contains complete, runnable examples:

| File | Description |
|---|---|
| [`playwright-example.ts`](./examples/playwright-example.ts) | Full Playwright test with email OTP and TOTP |
| [`general-usage.ts`](./examples/general-usage.ts) | All three providers, error handling, extractOTP standalone |

Run any example directly:

```bash
OTP_NINJA_DEBUG=true npx ts-node examples/general-usage.ts
```

---

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening a PR.

```bash
git clone https://github.com/qa-ashutosh/otp-ninja.git
cd otp-ninja
npm install
npm run build
npm test          # runs all 92 tests
npm run test:watch
```

---

## Changelog

See [`CHANGELOG.md`](./CHANGELOG.md) for the full release history.

---

## License

MIT. see [`LICENSE`](./LICENSE) for details.

---

<div align="center">

Built for the QA automation community. If otp-ninja saves you time, consider giving it a ⭐ on GitHub.

</div>
