/**
 * otp-ninja — Quoted-Printable Decoder
 *
 * HTML emails often encode their body using quoted-printable (QP) encoding.
 * Without decoding, OTPs embedded in HTML emails are invisible to regex patterns.
 *
 * RFC 2045 compliant implementation — no external dependencies.
 */

/**
 * Decode a quoted-printable encoded string.
 *
 * Handles:
 *  - Soft line breaks (=\r\n and =\n)
 *  - Hex-encoded bytes (=XX)
 *  - Plain ASCII passthrough
 */
export function decodeQuotedPrintable(input: string): string {
  return input
    // Remove soft line breaks
    .replace(/=\r\n/g, '')
    .replace(/=\n/g, '')
    // Decode hex sequences
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}
