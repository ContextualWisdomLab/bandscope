# API Security Checklist

## Purpose

Baseline checklist for tasks that introduce or modify HTTP/GraphQL/API-like surfaces.

## Checklist

- Validate all untrusted inputs with strict schema checks.
- Enforce explicit allowlists for origins, hosts, and IPC channels.
- Keep local backend access constrained to safe local channels (`127.0.0.1` or typed IPC) as applicable.
- Apply least privilege for tokens, workflow permissions, and secrets usage.
- Prevent command injection by avoiding shell interpolation for subprocess invocation.
- Ensure logs and telemetry avoid leaking credentials and sensitive user data.
- Add regression tests for rejected malformed inputs and unsafe boundary crossings.

## BandScope-specific notes

- File paths, URLs, metadata, model artifacts, and project formats are always untrusted.
- Security-sensitive defaults must fail closed when validation cannot establish trust.
