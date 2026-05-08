# Changelog

All notable changes to @ashforge/otp-ninja are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-05-08

### Added

Unified `fetchOTP()` entry point supporting all three provider types (email, SMS, and TOTP) through a single consistent API.
 
Email OTP fetching via IMAP with built-in support for Gmail, Outlook, Yahoo, iCloud, Fastmail, Zoho, and any custom IMAP server.
 
SMS OTP fetching via Twilio and Vonage with optional peer dependency installation so you install only the provider you use.
 
TOTP generation and verification built on RFC 6238 using Node.js built-in `crypto` with zero external dependencies. Compatible with Google Authenticator, Authy, Microsoft Authenticator, 1Password, and Bitwarden.
 
`generateFreshTOTP()` helper that guarantees a token has a minimum remaining validity window, preventing race conditions in automated tests.
 
Smart polling engine with configurable `timeout` and `pollInterval` across all providers so no manual retry loops are needed.
 
OTP extraction engine supporting plain text, HTML, quoted-printable encoding, and custom regex patterns via `extractOTP()`.
 
Eager configuration validation that catches wrong types, missing fields, and common mistakes like setting the `from` filter to your own email address, all before any network connection is attempted.
 
Enterprise error handling with fully typed error classes (`OTPNotFoundError`, `OTPTimeoutError`, `OTPConnectionError`, `OTPAuthenticationError`, `OTPInvalidConfigError`, `OTPExtractionError`, `OTPMissingDependencyError`, `OTPProviderError`, `OTPNetworkError`, `OTPPermissionError`, `OTPRateLimitError`), machine-readable error codes, structured context, credential-safe diagnostic output, and built-in recovery guides on every error.
 
`isOTPError()` and `isOTPErrorCode()` type guard helpers for clean error handling in consumer code.
 
Helper functions `gmailConfig()` and `outlookConfig()` for zero-friction provider setup, along with an `EMAIL_PROVIDERS` preset map covering Gmail, Outlook, Yahoo, iCloud, Fastmail, and Zoho.
 
TypeScript strict mode throughout with full IntelliSense and zero use of `any`.
 
Dual CJS and ESM output with explicit `outExtension` configuration to guarantee stable filenames across tsup versions.
 
Credential safety enforced at every layer with `maskSensitive()`, `maskEmail()`, and `maskPhone()` applied to all error context before anything is stored or logged.
 
`OTP_NINJA_DEBUG=true` environment variable for verbose polling output with credentials always masked.
 
CI pipeline testing across Node.js 16, 18, 20, and 22.
 
127 Jest tests across errors, validators, extractors, TOTP, and quoted-printable decoding.