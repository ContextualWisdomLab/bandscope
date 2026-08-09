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
failure. The repository stores fixture metadata and thresholds. Automated evidence persistence is
disabled and remains `planned`. A live run may be inspected transiently, but it may not upload or
retain a new operator/Actions artifact until repository governance accepts a named store, access
roles, TTL enforcement, deletion verification, and incident owner.

When those controls are accepted, the only permitted retained payload is benchmark evidence schema
v1 in `docs/TRD.md`: common candidate/fixture/model/tool provenance, a sanitized command-template
identity, stable stage/outcome, cleanup, and only the identity or score blocks actually reached. It
never contains literal invocation environment values, absolute paths, full URLs, provider bodies,
credentials, raw media, archives, or stems.

No relational database is introduced. `docs/architecture/diagrams.md` contains the authoritative
logical artifact relationship model; it is intentionally not a physical ERD.

## Alternatives considered

- Persist every run and media asset: rejected for rights, privacy, cost, and operational scope.
- Persist only numeric results in an application database: deferred because there is no current
  query, tenant, retention, or product workflow requiring it.
- Retain no evidence: rejected because release and regression decisions need traceable results.

## Consequences

Trend analysis is initially manual from explicitly documented, non-sensitive observations such as
the historical failure snapshots in this repository. A 30-day TTL is only a proposed default, not an
active retention authorization. Reproduction depends on external fixture availability, so exact
identity and stable failure codes are essential. A future hosted evidence service is a separate
bounded context and may not access user audio or BandScope's local project files directly.

## Security and governance implications

Evidence excludes raw audio, source archive content, full URLs, local paths, usernames, cookies,
credentials, literal environment assignments, and provider response bodies. Absolute executable and
model paths are verified transiently; retained identity uses canonical basenames, hashes, versions,
trusted package identity, and a sibling-layout verification flag. Any future Actions artifact must
be access-controlled, checksum-bound to the candidate, and expire under the accepted repository
policy. PII masking is not needed because PII is not collected; purpose limitation and
non-collection are the control.

## Acceptance, recovery, and rollback

- Temporary root is empty after the live test exits.
- Transient logs contain stable public fixture IDs, stage/outcome, and applicable numeric results
  only; they do not contain a literal command or local paths.
- Evidence schema v1 rejects raw media/path fields and enforces stage-dependent identity/score
  invariants.
- Before persistence is enabled, governance records the exact store, readers/writers, incident owner,
  TTL mechanism, deletion verification, and rollback. The proposed initial TTL is 30 days.
- Rollback disables artifact upload and deletes retained numeric artifacts according to the accepted
  TTL without affecting local projects.

## Supersession triggers

Supersede this ADR if recurring trend queries, audited release history, multi-tenant evidence, or a
hosted benchmark service is approved. That ADR must supply a physical ERD, authorization model,
retention/deletion policy, migrations, backup/restore, and rollback.
