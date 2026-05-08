/**
 * otp-ninja — OTP Extraction Engine
 *
 * Smart regex-based OTP extraction from plain text, HTML, and quoted-printable bodies.
 * Supports custom patterns for non-standard OTP formats.
 */

import { OTPErrorFactory } from './errors';

export interface ExtractOptions {
  otpPattern?: RegExp;
}

export interface ExtractResult {
  otp: string;
}

/**
 * Default patterns tried in order — most specific first.
 * Each pattern must have exactly one capture group containing the OTP.
 */
const DEFAULT_PATTERNS: RegExp[] = [
  // Explicit keyword patterns
  /(?:verification|confirm(?:ation)?|security|login|sign[- ]?in|access|one[- ]?time)\s+(?:code|pin|password|otp|token)[:\s]+([0-9]{4,8})/i,
  /(?:code|otp|pin|token)[:\s]+([0-9]{4,8})/i,
  /([0-9]{6})\s+is\s+your\s+(?:code|otp|pin|token|password)/i,
  /use\s+(?:code|otp|pin|token)[:\s]+([0-9]{4,8})/i,
  /enter\s+(?:code|otp|pin|token)[:\s]+([0-9]{4,8})/i,
  // Standalone digit sequences (4–8 digits, not part of a longer number)
  /\b([0-9]{6})\b/,
  /\b([0-9]{4,8})\b/,
];

/**
 * Extract an OTP from a text string.
 *
 * Tries the custom pattern first (if provided), then falls through the
 * default pattern list. Returns the first match found.
 *
 * @throws {OTPExtractionError}  If text is provided but no pattern matches.
 *                               If text is empty, returns null without throwing.
 */
export function extractOTP(text: string, options: ExtractOptions = {}): string | null {
  if (!text || text.trim().length === 0) return null;

  // Strip HTML tags to get plain text
  const plain = stripHtml(text);

  // Try custom pattern first
  if (options.otpPattern) {
    const match = plain.match(options.otpPattern);
    if (match) {
      const otp = match[1] ?? match[0];
      return otp.trim();
    }
    // Custom pattern was provided but didn't match — throw immediately
    throw OTPErrorFactory.extractionFailed({
      operation: 'extractOTP',
      sampleText: plain.slice(0, 200),
      triedPatterns: [options.otpPattern.toString()],
      expectedFormat: options.otpPattern.toString(),
    });
  }

  // Try default patterns
  for (const pattern of DEFAULT_PATTERNS) {
    const match = plain.match(pattern);
    if (match) {
      const otp = (match[1] ?? match[0]).trim();
      if (otp.length >= 4) return otp;
    }
  }

  return null;
}

/**
 * Strip HTML tags and decode common HTML entities.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/gi, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/\s+/g, ' ')
    .trim();
}
