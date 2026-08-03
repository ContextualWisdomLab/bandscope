# BandScope → naruon rehearsal handoff

BandScope remains a fully standalone, local-first desktop application. The naruon bridge is an **explicit export contract**, not a mandatory network dependency: BandScope can produce a versioned JSON artifact, and a separately authorized naruon connector may ingest that artifact as a Band norm-group, rehearsal Event, and status-bearing Commitment.

## Product outcome

The bridge closes the first BandScope side of the platform vertical described by `ContextualWisdomLab/bandscope#610` without coupling the desktop app to naruon internals.

A naruon deployment can use the artifact to:

- identify the band as an overlapping norm/reference group;
- place a rehearsal on the shared Event graph;
- preserve `confirmed`, `tentative`, or `desired` commitment strength;
- preserve organizer-versus-attendee RSVP direction;
- run status-weighted conflict detection without silently breaking a confirmed commitment;
- cite the BandScope source record and field-level evidence;
- calibrate downstream behavior from an explicit `0..1` confidence value.

BandScope itself continues to analyze songs and manage rehearsal material even when naruon is absent, offline, or intentionally disabled.

## TypeScript API

The dependency-free contract is exported from a stable package subpath:

```ts
import {
  createNaruonRehearsalHandoff,
  serializeNaruonRehearsalHandoff
} from "@bandscope/shared-types/naruon";

const artifact = createNaruonRehearsalHandoff({
  createdAt: "2026-08-03T01:23:45Z",
  source: {
    application: "bandscope",
    workspaceId: "workspace-local-alpha",
    bandId: "band-contextual-wisdom",
    rehearsalId: "rehearsal-2026-08-10"
  },
  normGroup: {
    kind: "band",
    id: "band-contextual-wisdom",
    label: "Contextual Wisdom Band"
  },
  event: {
    title: "August rehearsal",
    startsAt: "2026-08-10T19:00:00+09:00",
    endsAt: "2026-08-10T21:30:00+09:00",
    timeZone: "Asia/Seoul",
    venue: "Studio A"
  },
  commitment: {
    status: "confirmed",
    rsvpDirection: "organizer"
  },
  provenance: {
    sourceRecordId: "calendar-record-alpha",
    confidence: 0.94,
    evidence: [
      { field: "startsAt", value: "2026-08-10T19:00:00+09:00" },
      { field: "venue", value: "Studio A" }
    ]
  }
});

const json = serializeNaruonRehearsalHandoff(artifact);
```

Consumers receiving untrusted bytes must call `deserializeNaruonRehearsalHandoff` or `parseNaruonRehearsalHandoff` before use. Serialized handoffs are limited to 256 KiB of UTF-8 and are size-checked before JSON parsing. Preserve original transport bytes separately only when a detached-signature verification workflow requires them; application logic should use the validated canonical value.

## Boundary guarantees

The contract fails closed on:

- unknown fields at every object level;
- numeric-only IDs (BandScope and naruon IDs must remain opaque strings);
- blank, untrimmed, control-character-bearing, or oversized values;
- malformed or calendrically invalid RFC 3339 timestamps;
- an end time that is not later than its start time;
- time-zone identifiers rejected by the runtime's IANA/ICU database;
- numeric UTC offsets whose asserted local clock fields disagree with the required IANA time zone at that instant, including daylight-saving transitions;
- a norm-group identity that differs from the exported source band identity;
- unsupported commitment status or RSVP direction;
- non-finite or out-of-range confidence values;
- empty, sparse, oversized, or malformed provenance receipt arrays;
- JSON inputs larger than 256 KiB of UTF-8 or caller-owned values that cannot be safely snapshotted.

`Z` and `-00:00` are accepted with an explicit IANA zone as unknown-local-offset forms; a numeric `+/-HH:MM` offset is treated as an assertion and must agree with that zone. This follows the RFC 9557 distinction between an asserted numeric offset and time-zone information.

Parsing snapshots caller-owned data once before validation and canonicalization. It then returns newly allocated nested objects and evidence receipts, so accessors, proxies, concurrent mutation, or retained input references cannot make validation observe different data from the canonical output.

## Trust and privacy model

This artifact contains **rehearsal coordination facts only**. It does not grant naruon filesystem, database, calendar, mail, model, or network authority. Transport, tenant authorization, detached signature verification, consent, context bridging, and writeback remain responsibilities of the naruon plugin/connector installation.

A connector should:

1. authenticate the producing BandScope installation and intended naruon tenant;
2. verify a detached signature or authenticated transport envelope;
3. parse the artifact using this contract;
4. persist provenance before projecting Event/Commitment candidates;
5. keep per-band context segregated by default;
6. require explicit approval before any externally visible decline, reschedule, or CalDAV writeback.

## Compatibility

- `artifactKind`: `bandscope.naruon.rehearsal-event`
- `artifactVersion`: `1`
- Additive fields require a new version because version 1 rejects unknown keys.
- Breaking semantic changes require a new artifact kind or major version.
- The JSON Schema companion is `naruon-rehearsal-handoff-v1.schema.json`; validators must compile schema patterns with Unicode semantics for `\p{Nd}`, and the TypeScript parser remains authoritative for payload-size, snapshot, cross-field, leading/trailing whitespace normalization, Unicode-aware numeric-only identifier rejection, RFC 9557 offset/time-zone consistency, and IANA time-zone checks.
