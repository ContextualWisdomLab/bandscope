# Offline support manifest boundary

## Status and scope

This record describes the first bounded implementation slice of issue #963. It is **active-PR behavior**, not protected-branch shipped truth until the owning PR reaches protected `develop`.

Implemented in this slice:

- a schema-v1 manifest identifier and version;
- exact application version, immutable 40-hex source revision, build identifier, platform and architecture evidence;
- bounded diagnostic event count;
- stable event IDs, severity, stage, component, retryability, next-action code, correlation ID and monotonic sequence;
- an explicit structured-field allowlist (`errorClass`, `backend`, `device`, `codec`, `durationMs`, `queueDepth`);
- deterministic sequence ordering and JSON serialization; and
- fail-closed rejection of malformed or over-budget authority-bearing values.

Not implemented in this slice:

- the local ring buffer;
- crash/hang capture;
- archive generation or compression;
- a buyer-facing preview/export UI;
- manifest hashing/signing;
- OpenTelemetry projection or remote export; or
- automatic upload of any diagnostic material.

Those remain separate #963 work and must not be inferred from the presence of this manifest helper.

## Privacy and trust boundary

Runtime diagnostic objects are untrusted input even when TypeScript callers are typed. `buildSupportBundleManifest()` therefore accepts `unknown` and constructs a new object from an allowlist. It never serializes the caller object wholesale and never attempts broad post-hoc masking.

The following caller-owned categories have no schema slot and are discarded rather than copied: absolute paths, raw URLs, environment variables, credentials, bearer/API tokens, exception messages, stack traces, subprocess arguments, audio, score PDFs, project JSON, lyrics and handoff payloads.

Allowed string fields use a bounded identifier-like grammar. Numeric evidence is admitted only as finite safe non-negative integers with field-specific ceilings. Event sequence values must be unique, preventing ambiguous order evidence. One manifest accepts at most 128 events before mapping or serialization.

## Determinism and standards boundary

The serialized form is RFC 8259 JSON with stable property construction, event sorting by `sequence`, two-space indentation and one final newline. Object member order is a BandScope serialization convention for reproducible artifacts; RFC 8259 itself defines JSON object semantics independently of this repository convention.

`generatedAt` uses a deliberately narrower UTC-only profile of RFC 3339: four-digit date, complete time, optional fractional seconds and a terminal `Z`. This slice does not accept local offsets or additional RFC 9557 zone annotations because the support artifact needs one unambiguous canonical timestamp representation before later archive hashing is introduced.

NIST SP 800-92 is used as operational rationale for deliberate log-management design and bounded useful evidence, not as a certification claim. OpenTelemetry's stable Logs Data Model is a future interoperability target for #963; this slice does **not** emit OpenTelemetry records. Current OpenTelemetry semantic conventions remain separately versioned and must be evaluated when that projection is implemented.

## Traceability

| Requirement | Executable evidence |
| --- | --- |
| Schema/version and build identity are deterministic | `supportBundle.test.ts` — stable schema-v1 manifest assertion |
| Event ordering cannot be ambiguous | out-of-order valid fixture plus duplicate-sequence rejection |
| Arbitrary secret/path/URL/content payloads cannot enter the manifest | adversarial allowlist-only serialization regression |
| Event count and values are bounded before serialization | oversized event collection and numeric/token boundary regressions |
| Runtime values are not coerced into authority | malformed top-level/event/Boolean/string/numeric regressions |
| Optional structured evidence remains minimal | undefined/empty-fields regressions |

This is only the manifest boundary. The #963 acceptance criteria for offline archive safety, preview/exclusion, crash evidence, concurrent event capture, retention, support-tool parsing, hashing/signing, OpenTelemetry compatibility and user-facing export remain open.

## References (APA 7)

Bray, T. (2017). *The JavaScript Object Notation (JSON) Data Interchange Format* (RFC 8259; STD 90). Internet Engineering Task Force. https://doi.org/10.17487/RFC8259

Kent, K., & Souppaya, M. (2006). *Guide to computer security log management* (NIST Special Publication 800-92). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-92

Klyne, G., & Newman, C. (2002). *Date and time on the Internet: Timestamps* (RFC 3339). Internet Engineering Task Force. https://doi.org/10.17487/RFC3339

OpenTelemetry. (2026). *Logs data model*. https://opentelemetry.io/docs/specs/otel/logs/data-model/

OpenTelemetry. (2026). *Semantic conventions 1.44.0*. https://opentelemetry.io/docs/specs/semconv/
