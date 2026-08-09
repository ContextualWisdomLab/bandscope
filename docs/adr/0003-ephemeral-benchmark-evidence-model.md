# ADR-0003: Ephemeral Benchmark Evidence Model

Status: Proposed on active branch
Date: 2026-08-09

## Context and drivers

The known-stem benchmark handles copyrighted media, decoded waveforms, separated arrays, local
paths, model artifacts, and numeric evidence. Adding a database merely to retain benchmark state
would expand privacy, authorization, migration, backup, and deletion obligations without a current
product need.

## Decision

Downloaded audio, extracted references, scored windows, and separated stems are ephemeral and live
only inside a test-owned temporary directory or process memory. Cleanup occurs on success and
failure. The repository stores fixture metadata and thresholds. When controlled evidence retention
is authorized, retain only exact commit/lock/model/fixture identities, platform, timestamps, numeric
scores, duration, outcome code, and cleanup result as a bounded Actions/operator artifact.

No relational database is introduced. `docs/architecture/diagrams.md` contains the authoritative
logical artifact relationship model; it is intentionally not a physical ERD.

## Alternatives considered

- Persist every run and media asset: rejected for rights, privacy, cost, and operational scope.
- Persist only numeric results in an application database: deferred because there is no current
  query, tenant, retention, or product workflow requiring it.
- Retain no evidence: rejected because release and regression decisions need traceable results.

## Consequences

Trend analysis is initially manual or artifact-based. Evidence retention must have an explicit TTL
and access policy. Reproduction depends on external fixture availability, so exact identity and
failure codes are essential. A future hosted evidence service is a separate bounded context and may
not access user audio or BandScope's local project files directly.

## Security and governance implications

Evidence excludes raw audio, source archive content, full URLs, local paths, usernames, cookies,
credentials, and provider response bodies. Actions artifacts must be access-controlled, checksum
bound to the candidate, and expire under repository policy. PII masking is not needed because PII is
not collected; purpose limitation and non-collection are the control.

## Acceptance, recovery, and rollback

- Temporary root is empty after the live test exits.
- Logs contain stable public fixture IDs and numeric results only.
- Evidence schema rejects raw media/path fields.
- Rollback deletes retained numeric artifacts according to TTL without affecting local projects.

## Supersession triggers

Supersede this ADR if recurring trend queries, audited release history, multi-tenant evidence, or a
hosted benchmark service is approved. That ADR must supply a physical ERD, authorization model,
retention/deletion policy, migrations, backup/restore, and rollback.
