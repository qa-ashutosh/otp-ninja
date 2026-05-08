/**
 * Tests for the otp-ninja OTP extraction engine.
 */

import { extractOTP } from '../src/core/extractor.js';
import { OTPExtractionError } from '../src/core/errors.js';

describe('extractOTP', () => {
  // Default pattern extraction
  it('extracts a 6-digit OTP after "verification code"', () => {
    expect(extractOTP('Your verification code is 482910')).toBe('482910');
  });

  it('extracts a 6-digit OTP after "code:"', () => {
    expect(extractOTP('Code: 123456')).toBe('123456');
  });

  it('extracts a 4-digit OTP', () => {
    expect(extractOTP('Your PIN is 4821')).toBe('4821');
  });

  it('extracts OTP from HTML email body', () => {
    const html = '<p>Your <strong>verification code</strong> is <span>482910</span></p>';
    expect(extractOTP(html)).toBe('482910');
  });

  it('returns null for empty string', () => {
    expect(extractOTP('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(extractOTP('   ')).toBeNull();
  });

  it('returns null when no OTP pattern matches', () => {
    expect(extractOTP('Hello, welcome to our service!')).toBeNull();
  });

  // Custom pattern
  it('uses custom otpPattern when provided', () => {
    const result = extractOTP('token XK-38291 to continue', {
      otpPattern: /token\s+([A-Z]{2}-\d{5})/i,
    });
    expect(result).toBe('XK-38291');
  });

  it('throws OTPExtractionError when custom pattern does not match', () => {
    expect(() =>
      extractOTP('Your code is 123456', { otpPattern: /NOMATCH-(\d{10})/ })
    ).toThrow(OTPExtractionError);
  });

  it('custom pattern error contains EXTRACTION_FAILED code', () => {
    try {
      extractOTP('some text', { otpPattern: /NOMATCH-(\d{10})/ });
    } catch (err) {
      expect((err as OTPExtractionError).code).toBe('EXTRACTION_FAILED');
    }
  });

  // HTML stripping
  it('strips style tags before extraction', () => {
    const html = '<style>.otp{color:red}</style><p>Code: 482910</p>';
    expect(extractOTP(html)).toBe('482910');
  });

  it('strips script tags before extraction', () => {
    const html = '<script>var x=123456</script><p>Your code is 482910</p>';
    expect(extractOTP(html)).toBe('482910');
  });

  it('decodes HTML entities', () => {
    expect(extractOTP('Code:&nbsp;482910')).toBe('482910');
  });
});
