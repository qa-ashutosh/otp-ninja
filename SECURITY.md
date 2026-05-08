# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 1.x | Yes |

## Reporting a Vulnerability

Do not open a public GitHub issue for security vulnerabilities.

Email the maintainer directly at: *qa.ashutosh3@gmail.com*

Include a description of the vulnerability, steps to reproduce it, and the potential impact. You will receive an acknowledgement within 48 hours and a resolution timeline within 7 days.

## Security Design

otp-ninja is designed with credential safety as a hard requirement.

Credentials are never logged. All error context passes through `maskSensitive()` before anything is stored or printed. Email addresses appear as `***@domain.com`. Phone numbers appear as `***2671`. Passwords, API keys, and tokens appear as `***`.

TLS is enforced by default for all IMAP connections. Setting `tls: false` is only appropriate for local test mail servers on a private network.

No credential persistence. Credentials flow directly to the provider and are not stored, cached, or transmitted anywhere else.

Peer dependencies are optional. Users install only the provider SDKs they need, reducing the attack surface.
