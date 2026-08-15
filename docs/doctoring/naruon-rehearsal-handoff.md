# BandScope → naruon rehearsal handoff standards evidence

## Status

**Active Draft PR evidence.** This record documents the standards basis for the versioned BandScope → naruon rehearsal handoff introduced on PR #737. It is not protected-`develop` shipped truth until the implementation is merged and revalidated on the protected branch.

## Scope and architectural decision

BandScope remains independently useful and local-first. The integration boundary is a dependency-free, versioned JSON artifact rather than a mandatory naruon network dependency. The TypeScript parser is the authoritative application trust boundary; the public JSON Schema is a portable structural companion, not a substitute for application-level semantic validation.

This split is intentional. JSON Schema Draft 2020-12 separates structural validation from semantic `format` handling, and its standard meta-schema does not require `format` to be asserted by default. Therefore, consumers cannot safely assume that a generic schema validator will fully validate date-time semantics merely because a property declares `"format": "date-time"` (Wright et al., 2022). BandScope consequently performs calendrical, IANA-zone, cross-field, size, snapshot, and offset-consistency checks in the TypeScript parser.

## Timestamp profile and time-zone semantics

The handoff uses a deliberately bounded RFC 3339-derived timestamp profile:

- four-digit years, two-digit month/day/time fields, an explicit `T`, and an explicit `Z` or numeric UTC offset;
- calendar-valid dates and bounded fractional seconds;
- uppercase `T`/`Z` canonical spelling;
- no leap-second `:60` values at this application boundary; and
- an explicit IANA time-zone identifier stored separately in `event.timeZone`.

RFC 3339 permits leap-second `:60` under its leap-second rules and notes that lowercase `t`/`z` can be accepted by the ABNF, while also allowing specifications in case-sensitive contexts to require uppercase spellings (Klyne & Newman, 2002). BandScope intentionally chooses a narrower scheduling profile: rehearsal events do not need leap-second representation, and canonical uppercase serialization avoids cross-runtime ambiguity. Documentation must therefore describe this as BandScope's RFC 3339 profile rather than implying acceptance of every RFC 3339 lexical form.

RFC 9557 updates RFC 3339's interpretation of `Z`: `Z` expresses that the UTC instant is known while the preferred local offset is not asserted; `-00:00` has the same semantic meaning but is less interoperable and `Z` is preferred. By contrast, a numeric offset is an assertion that can be inconsistent with named time-zone information (Sharma & Bormann, 2024). The handoff reflects that distinction:

- `Z` and `-00:00` do not assert local clock fields against `event.timeZone`;
- numeric `+/-HH:MM` offsets are checked against the required IANA zone at that instant; and
- an inconsistency is rejected rather than silently choosing one source of temporal truth.

Although RFC 9557 serializes named time zones as IXDTF suffixes, BandScope carries the IANA identifier in a separate required JSON field. The semantic rule is deliberately equivalent to treating the named zone as critical application information: a consumer must not project an event whose asserted numeric offset conflicts with the required zone.

## JSON and schema boundary

RFC 8259 defines JSON's interoperable data model and requires object member names to be strings; it does not provide application authorization, provenance, or semantic identity guarantees (Bray, 2017). The handoff therefore adds fail-closed application constraints beyond JSON syntax:

- `additionalProperties: false` at every public object level;
- bounded strings, arrays, and serialized UTF-8 size;
- opaque nonnumeric identifiers;
- exact artifact kind/version discriminators;
- canonical key order for deterministic serialization;
- band identity consistency between `source.bandId` and `normGroup.id`;
- finite calibrated confidence in `[0, 1]`;
- dense bounded evidence receipts; and
- payload-safe diagnostics that report schema-owned locations without echoing attacker-controlled unknown property names.

JSON Schema Draft 2020-12 expects Unicode-aware regular-expression behavior, but validator implementations can still differ in feature support. The checked-in schema therefore documents that consumers must use Unicode semantics for `\p{Nd}` and must invoke the TypeScript parser for semantic checks that are not portable schema assertions.

## Security, privacy, and evidence implications

The artifact carries authorized rehearsal coordination facts and provenance; it is not itself an authorization token. It grants no filesystem, database, calendar, mail, model, or network capability. Connector authentication, tenant binding, consent, signature/authenticated-envelope verification, persistence, and externally visible writeback remain outside the shared-types package.

For audit readiness, a receiving connector should preserve the validated artifact plus transport/signature evidence, maintain tenant/band segregation, and record the mapping from `sourceRecordId`/field evidence to any projected Event or Commitment. Validation errors must remain payload-safe so logs do not become a secondary disclosure channel for person, tenant, credential, or other caller-controlled property names.

## Verification contract

Commercial verification for this boundary requires all of the following:

1. runtime parser and public schema reject unknown fields and malformed structure;
2. runtime parser enforces the semantic rules the schema cannot portably guarantee, including IANA-zone availability, numeric-offset consistency, cross-field identity, canonical snapshotting, and serialized-size limits;
3. deterministic serialization is invariant to caller key insertion order;
4. valid `Z`/`-00:00` unknown-local-offset forms remain accepted with an explicit IANA zone, while inconsistent numeric offsets fail closed;
5. the deliberately narrower timestamp profile rejects leap-second `:60` and noncanonical lowercase timestamp separators as application policy rather than misclassifying those forms as universally invalid RFC 3339; and
6. repository exact-head type, lint, test, coverage, SAST, security, SBOM, supply-chain, and independent-review gates remain mandatory.

## References

Bray, T. (2017). *The JavaScript Object Notation (JSON) data interchange format* (RFC 8259). Internet Engineering Task Force. https://doi.org/10.17487/RFC8259

Klyne, G., & Newman, C. (2002). *Date and time on the Internet: Timestamps* (RFC 3339). Internet Engineering Task Force. https://doi.org/10.17487/RFC3339

Sharma, U., & Bormann, C. (2024). *Date and time on the Internet: Timestamps with additional information* (RFC 9557). Internet Engineering Task Force. https://doi.org/10.17487/RFC9557

Wright, A., Andrews, H., Hutton, B., & Dennis, G. (2022). *JSON Schema Draft 2020-12*. JSON Schema. https://json-schema.org/draft/2020-12
