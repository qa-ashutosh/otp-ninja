# Contributing to otp-ninja

Thank you for taking the time to contribute.

## Getting Started

```bash
git clone https://github.com/qa-ashutosh/otp-ninja.git
cd otp-ninja
npm install
npm run build
npm test
```

## Development Workflow

Run the full test suite:

```bash
npm test
```

Run tests in watch mode during development:

```bash
npm run test:watch
```

Check types without building:

```bash
npm run typecheck
```

Lint the source:

```bash
npm run lint
npm run lint:fix
```

Build the package:

```bash
npm run build
```

## Pull Request Guidelines

Keep each PR focused on one change. Split unrelated changes into separate PRs.

Add or update tests for any new behaviour. The coverage thresholds in `jest.config.js` are enforced in CI.

Follow the existing code style. TypeScript strict mode is non-negotiable — no `any`, no type assertions without a comment explaining why.

Update `CHANGELOG.md` with a brief description of your change under a new `[Unreleased]` heading.

Write commit messages in the imperative mood: "Add Vonage SMS provider", not "Added Vonage SMS provider".

## Reporting Bugs

Open an issue using the Bug Report template. Include the otp-ninja version, Node.js version, provider used, and the full error output from `err.toDiagnosticString()`.

## Security Vulnerabilities

Do not open a public issue for security vulnerabilities. See `SECURITY.md` for the responsible disclosure process.

## Code of Conduct

Be kind and constructive. Treat everyone with respect.