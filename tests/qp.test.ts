/**
 * Tests for the quoted-printable decoder.
 */

import { decodeQuotedPrintable } from '../src/core/qp.js';

describe('decodeQuotedPrintable', () => {
  it('removes soft line breaks (=\\r\\n)', () => {
    expect(decodeQuotedPrintable('Hello=\r\nWorld')).toBe('HelloWorld');
  });

  it('removes soft line breaks (=\\n)', () => {
    expect(decodeQuotedPrintable('Hello=\nWorld')).toBe('HelloWorld');
  });

  it('decodes hex sequences', () => {
    expect(decodeQuotedPrintable('=41=42=43')).toBe('ABC');
  });

  it('passes through plain ASCII unchanged', () => {
    expect(decodeQuotedPrintable('Your OTP is 482910')).toBe('Your OTP is 482910');
  });

  it('handles mixed encoded and plain content', () => {
    const input = 'Your code=\r\n is =34=38=32=39=31=30 for login';
    const result = decodeQuotedPrintable(input);
    expect(result).toContain('482910');
  });
});
