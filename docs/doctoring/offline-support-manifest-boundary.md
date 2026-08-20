# Offline support manifest boundary

## Status and scope

This record describes bounded implementation slices of issue #963. They are **active-PR behavior**, not protected-branch shipped truth until the owning PR reaches protected `develop`.

Implemented in the current branch:

- a schema-v1 manifest identifier and version;
- exact application version, immutable 40-hex source revision, build identifier, platform and architecture evidence;
- a canonical UTC `generatedAt` whose date and clock fields must describe an actual Gregorian calendar instant rather than a JavaScript-normalized date;
- bounded diagnostic event count;
- stable event IDs, severity, stage, component, retryability, next-action code, correlation ID and monotonic sequence;
- single-read snapshots of untrusted object/array evidence with accessor failures contained at the stable manifest boundary;
- an explicit structured-field allowlist (`errorClass`, `backend`, `device`, `codec`, `durationMs`, `queueDepth`);
- rejection of high-confidence credential prefixes at a token boundary before any allowed string can enter the manifest or report;
- deterministic sequence ordering and JSON serialization;
- a deterministic human-readable report rendered only from the already privacy-minimized manifest model;
- a local bounded `SupportDiagnosticBuffer` that validates and minimizes each event before mutation, requires strictly increasing sequence authority, evicts only the oldest retained event at capacity, and returns detached event/field snapshots; and
- fail-closed rejection of malformed or over-budget authority-bearing values.

Not implemented in this branch:

- crash/hang capture;
- archive generation or compression;
- a buyer-facing preview/export UI;
- manifest hashing/signing;
- OpenTelemetry projection or remote export;
- cross-process or multi-producer diagnostic collection; or
- automatic upload of any diagnostic material.

Those remain separate #963 work and must not be inferred from the presence of this manifest/buffer helper.

## Privacy and trust boundary

Runtime diagnostic objects are untrusted input even when TypeScript callers are typed. `buildSupportBundleManifest()` therefore accepts `unknown` and constructs a new object from an allowlist. It never serializes the caller object wholesale and never attempts broad post-hoc masking.

The boundary also treats accessors and proxies as untrusted execution surfaces. Authority-bearing properties are read exactly once into local snapshots before validation or projection. Property-access exceptions are contained and converted to the stable `Invalid support bundle input` failure rather than allowing dependency-controlled exception text to cross the support boundary. Event collections are bounded from their observed length before snapshotting and are rejected if their snapshotted cardinality changes.

The following caller-owned categories have no schema slot and are discarded rather than copied: absolute paths, raw URLs, environment variables, credentials, bearer/API tokens, exception messages, stack traces, subprocess arguments, audio, score PDFs, project JSON, lyrics and handoff payloads.

Allowed string fields additionally reject high-confidence GitHub, OpenAI-style and Slack-style credential prefixes when the prefix starts the token or follows one of the token grammar's structural delimiters (`.`, `_`, `:`, `-`). This catches values such as a correlation identifier whose namespace is followed by a credential-shaped segment without treating an ordinary interior letter sequence such as `risk-score` as a credential.

`SupportDiagnosticBuffer.record()` runs the same event projection before retained state changes. An invalid event therefore cannot partially mutate the buffer. The buffer retains only the minimized event model, not the original runtime object, and `snapshot()` copies both each event and its structured-field object so a UI/report caller cannot rewrite retained diagnostic evidence. Capacity is constrained to 1–128 events, matching the manifest ceiling. Once recording has begun, sequence values must increase strictly; duplicate or out-of-order evidence fails closed instead of silently reordering operational history.

`serializeSupportBundleManifest()` and `renderSupportBundleReport()` both derive their output from `buildSupportBundleManifest()`. The human report does not inspect the original runtime diagnostic object after validation, so a raw message, path, URL, stack, secret, environment value, subprocess argument, or user-content property cannot regain output authority merely because a human-readable representation is requested.

Allowed string fields use a bounded identifier-like grammar. Numeric evidence is admitted only as finite safe non-negative integers with field-specific ceilings. Event sequence values must be unique, preventing ambiguous order evidence. One manifest accepts at most 128 events before mapping or serialization.

## Determinism and standards boundary

The serialized form is RFC 8259 JSON with stable property construction, event sorting by `sequence`, two-space indentation and one final newline. Object member order is a BandScope serialization convention for reproducible artifacts; RFC 8259 itself defines JSON object semantics independently of this repository convention.

The human-readable report uses the same sorted manifest and stable allowlisted field insertion order. It is an operator-readable projection of the schema-v1 evidence, not an independent diagnostic source of truth and not yet the buyer-facing preview/export UI required for the complete #963 support bundle.

The local buffer is deterministic for one producer: accepted events preserve insertion/sequence order, and overflow removes exactly the oldest retained event. It does not claim lock-free, cross-thread, cross-process, or durable crash-surviving capture. Those concerns require a separate implementation and acceptance boundary rather than being inferred from an in-memory TypeScript class.

`generatedAt` uses a deliberately narrower UTC-only profile of RFC 3339: four-digit date, complete time, optional fractional seconds and a terminal `Z`. This branch does not accept local offsets or additional RFC 9557 zone annotations because the support artifact needs one unambiguous canonical timestamp representation before later archive hashing is introduced.

Calendar validity is checked from the timestamp fields themselves. Month ranges, Gregorian leap-year February length, other month lengths, and 23:59:59 clock ceilings are validated before the value can become evidence. JavaScript `Date.parse()` is not used as calendar authority because engines can normalize impossible inputs such as February 31 into a later valid date. That normalization would make the support artifact claim a timestamp the caller never supplied. The fail-closed regression therefore includes impossible February and 30-day-month dates.

NIST SP 800-92 is used as operational rationale for deliberate log-management design and bounded useful evidence, not as a certification claim. OpenTelemetry's stable Logs Data Model is a future interoperability target for #963; this branch does **not** emit OpenTelemetry records. Current OpenTelemetry semantic conventions remain separately versioned and must be evaluated when that projection is implemented.

## Traceability

| Requirement | Executable evidence |
| --- | --- |
| Schema/version and build identity are deterministic | `supportBundle.test.ts` — stable schema-v1 manifest assertion |
| Canonical UTC time is a real Gregorian date rather than a normalized impossible date | malformed top-level identity regression rejects February 31 and April 31 |
| Accessor-backed authority cannot change between validation and projection | single-read `retryable` accessor regression |
| Accessor exceptions cannot leak dependency-controlled error payloads | throwing `app` accessor regression requires the stable boundary error |
| Credential-shaped allowed strings cannot enter machine or human output | `supportBundle.credential-boundary.test.ts` covers direct and delimiter-prefixed credential segments plus non-secret interior text |
| Event ordering cannot be ambiguous | out-of-order valid fixture plus duplicate-sequence rejection |
| Arbitrary secret/path/URL/content payloads cannot enter the manifest | adversarial allowlist-only serialization regression |
| Human-readable evidence cannot reintroduce raw diagnostic payloads | exact report regression with path/token/message/URL-shaped discarded inputs |
| Event count and values are bounded before serialization | oversized event collection and numeric/token boundary regressions |
| Runtime values are not coerced into authority | malformed top-level/event/Boolean/string/numeric regressions |
| Optional structured evidence remains minimal | undefined/empty-fields regressions |
| Local diagnostics remain bounded and newest evidence survives overflow | `supportDiagnostics.test.ts` two-slot overflow regression |
| Invalid/out-of-order events cannot partially mutate retained state | `supportDiagnostics.test.ts` invalid-record and sequence-authority regressions |
| Snapshot consumers cannot rewrite retained diagnostics | detached event/field snapshot regression |

This is still not the complete support archive. The #963 acceptance criteria for archive safety, preview/exclusion, crash/hang evidence, cross-process or concurrent collection, retention, support-tool parsing, hashing/signing, OpenTelemetry compatibility and user-facing export remain open.

## References (APA 7)

Bray, T. (2017). *The JavaScript Object Notation (JSON) Data Interchange Format* (RFC 8259; STD 90). Internet Engineering Task Force. https://doi.org/10.17487/RFC8259

Kent, K., & Souppaya, M. (2006). *Guide to computer security log management* (NIST Special Publication 800-92). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-92

Klyne, G., & Newman, C. (2002). *Date and time on the Internet: Timestamps* (RFC 3339). Internet Engineering Task Force. https://doi.org/10.17487/RFC3339

OpenTelemetry. (2026). *Logs data model*. https://opentelemetry.io/docs/specs/otel/logs/data-model/

OpenTelemetry. (2026). *Semantic conventions 1.44.0*. https://opentelemetry.io/docs/specs/semconv/
