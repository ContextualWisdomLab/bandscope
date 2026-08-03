/** Stable artifact kind emitted by BandScope for naruon ingestion. */
export const NARUON_REHEARSAL_HANDOFF_KIND = "bandscope.naruon.rehearsal-event" as const;

/** Current additive schema version for the naruon rehearsal handoff. */
export const NARUON_REHEARSAL_HANDOFF_VERSION = 1 as const;

/** Maximum number of provenance receipts accepted in one handoff. */
export const MAX_NARUON_EVIDENCE_RECEIPTS = 64;

const MAX_IDENTIFIER_LENGTH = 256;
const MAX_DISPLAY_TEXT_LENGTH = 2_048;
const MAX_TIME_ZONE_LENGTH = 128;
const RFC3339_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const COMMITMENT_STATUSES = ["confirmed", "tentative", "desired"] as const;
const RSVP_DIRECTIONS = ["organizer", "attendee"] as const;

/** Commitment strength used by naruon's status-weighted conflict resolver. */
export type NaruonCommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

/** Whether the BandScope user organizes or attends the rehearsal. */
export type NaruonRsvpDirection = (typeof RSVP_DIRECTIONS)[number];

/** Field-level source receipt included in a naruon handoff. */
export type NaruonEvidenceReceipt = {
  field: string;
  value: string;
};

/** Local BandScope identity and tenancy information for a handoff. */
export type NaruonHandoffSource = {
  application: "bandscope";
  workspaceId: string;
  bandId: string;
  rehearsalId: string;
};

/** Band norm-group contributed to naruon's shared knowledge graph. */
export type NaruonBandNormGroup = {
  kind: "band";
  id: string;
  label: string;
};

/** Scheduled rehearsal event represented independently of any calendar vendor. */
export type NaruonRehearsalEvent = {
  title: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  venue?: string;
};

/** Commitment metadata required for status-weighted conflict resolution. */
export type NaruonRehearsalCommitment = {
  status: NaruonCommitmentStatus;
  rsvpDirection: NaruonRsvpDirection;
};

/** Auditable evidence and calibrated confidence for the exported event. */
export type NaruonHandoffProvenance = {
  sourceRecordId: string;
  confidence: number;
  evidence: NaruonEvidenceReceipt[];
};

/**
 * Versioned, network-agnostic BandScope artifact that naruon can ingest as a
 * Band norm-group, rehearsal Event, and status-bearing Commitment.
 */
export type NaruonRehearsalHandoff = {
  artifactKind: typeof NARUON_REHEARSAL_HANDOFF_KIND;
  artifactVersion: typeof NARUON_REHEARSAL_HANDOFF_VERSION;
  createdAt: string;
  source: NaruonHandoffSource;
  normGroup: NaruonBandNormGroup;
  event: NaruonRehearsalEvent;
  commitment: NaruonRehearsalCommitment;
  provenance: NaruonHandoffProvenance;
};

/** Input accepted by the canonical handoff builder. */
export type CreateNaruonRehearsalHandoffInput = Omit<
  NaruonRehearsalHandoff,
  "artifactKind" | "artifactVersion"
>;

/** Return whether a value is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return whether an array has every numeric index materialized. */
function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  const length = Number(value.length);
  if (!Number.isSafeInteger(length) || length < 0) return false;
  for (let index = 0; index < length; index += 1) {
    if (!(index in value)) return false;
  }
  return true;
}

/** Return the first key outside an exact allowlist. */
function unexpectedKey(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string
): string | null {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      return `${path}.${key}`;
    }
  }
  return null;
}

/** Return whether text is printable, trimmed, non-empty, and bounded. */
function isDisplayText(value: unknown, maximumLength = MAX_DISPLAY_TEXT_LENGTH): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

/** Return whether an identifier is opaque rather than numeric or user-facing. */
function isOpaqueIdentifier(value: unknown): value is string {
  return (
    isDisplayText(value, MAX_IDENTIFIER_LENGTH) &&
    !/^\d+$/u.test(value)
  );
}

/** Return whether a value belongs to a readonly string enum. */
function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

/** Return whether an RFC 3339 timestamp is both syntactically and calendrically valid. */
function isRfc3339(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = RFC3339_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

/** Return whether a time-zone identifier is accepted by the host ICU database. */
function isTimeZone(value: unknown): value is string {
  if (!isDisplayText(value, MAX_TIME_ZONE_LENGTH)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Validate one source receipt. */
function validateEvidenceReceipt(value: unknown, path: string): string | null {
  if (!isRecord(value)) return `${path} must be an object`;
  const extra = unexpectedKey(value, ["field", "value"], path);
  if (extra) return `${extra} is not allowed`;
  if (!isDisplayText(value.field, MAX_IDENTIFIER_LENGTH)) return `${path}.field is invalid`;
  if (!isDisplayText(value.value)) return `${path}.value is invalid`;
  return null;
}

/**
 * Validate an unknown value at the BandScope → naruon trust boundary.
 *
 * The validator is intentionally fail-closed: unknown keys, numeric-only IDs,
 * malformed timestamps, invalid IANA time zones, sparse arrays, inconsistent
 * band identities, and non-finite confidence values are rejected.
 */
export function validateNaruonRehearsalHandoff(value: unknown): string | null {
  if (!isRecord(value)) return "root must be an object";
  const rootExtra = unexpectedKey(
    value,
    [
      "artifactKind",
      "artifactVersion",
      "createdAt",
      "source",
      "normGroup",
      "event",
      "commitment",
      "provenance"
    ],
    "root"
  );
  if (rootExtra) return `${rootExtra} is not allowed`;
  if (value.artifactKind !== NARUON_REHEARSAL_HANDOFF_KIND) return "artifactKind is invalid";
  if (value.artifactVersion !== NARUON_REHEARSAL_HANDOFF_VERSION) return "artifactVersion is invalid";
  if (!isRfc3339(value.createdAt)) return "createdAt is invalid";

  if (!isRecord(value.source)) return "source must be an object";
  const sourceExtra = unexpectedKey(
    value.source,
    ["application", "workspaceId", "bandId", "rehearsalId"],
    "source"
  );
  if (sourceExtra) return `${sourceExtra} is not allowed`;
  if (value.source.application !== "bandscope") return "source.application is invalid";
  for (const field of ["workspaceId", "bandId", "rehearsalId"] as const) {
    if (!isOpaqueIdentifier(value.source[field])) return `source.${field} is invalid`;
  }

  if (!isRecord(value.normGroup)) return "normGroup must be an object";
  const normExtra = unexpectedKey(value.normGroup, ["kind", "id", "label"], "normGroup");
  if (normExtra) return `${normExtra} is not allowed`;
  if (value.normGroup.kind !== "band") return "normGroup.kind is invalid";
  if (!isOpaqueIdentifier(value.normGroup.id)) return "normGroup.id is invalid";
  if (!isDisplayText(value.normGroup.label)) return "normGroup.label is invalid";
  if (value.normGroup.id !== value.source.bandId) return "normGroup.id must equal source.bandId";

  if (!isRecord(value.event)) return "event must be an object";
  const eventExtra = unexpectedKey(
    value.event,
    ["title", "startsAt", "endsAt", "timeZone", "venue"],
    "event"
  );
  if (eventExtra) return `${eventExtra} is not allowed`;
  if (!isDisplayText(value.event.title)) return "event.title is invalid";
  if (!isRfc3339(value.event.startsAt)) return "event.startsAt is invalid";
  if (!isRfc3339(value.event.endsAt)) return "event.endsAt is invalid";
  if (Date.parse(value.event.endsAt) <= Date.parse(value.event.startsAt)) {
    return "event.endsAt must be later than event.startsAt";
  }
  if (!isTimeZone(value.event.timeZone)) return "event.timeZone is invalid";
  if (value.event.venue !== undefined && !isDisplayText(value.event.venue)) {
    return "event.venue is invalid";
  }

  if (!isRecord(value.commitment)) return "commitment must be an object";
  const commitmentExtra = unexpectedKey(
    value.commitment,
    ["status", "rsvpDirection"],
    "commitment"
  );
  if (commitmentExtra) return `${commitmentExtra} is not allowed`;
  if (!isOneOf(COMMITMENT_STATUSES, value.commitment.status)) {
    return "commitment.status is invalid";
  }
  if (!isOneOf(RSVP_DIRECTIONS, value.commitment.rsvpDirection)) {
    return "commitment.rsvpDirection is invalid";
  }

  if (!isRecord(value.provenance)) return "provenance must be an object";
  const provenanceExtra = unexpectedKey(
    value.provenance,
    ["sourceRecordId", "confidence", "evidence"],
    "provenance"
  );
  if (provenanceExtra) return `${provenanceExtra} is not allowed`;
  if (!isOpaqueIdentifier(value.provenance.sourceRecordId)) {
    return "provenance.sourceRecordId is invalid";
  }
  if (
    typeof value.provenance.confidence !== "number" ||
    !Number.isFinite(value.provenance.confidence) ||
    value.provenance.confidence < 0 ||
    value.provenance.confidence > 1
  ) {
    return "provenance.confidence is invalid";
  }
  if (
    !isDenseArray(value.provenance.evidence) ||
    value.provenance.evidence.length < 1 ||
    value.provenance.evidence.length > MAX_NARUON_EVIDENCE_RECEIPTS
  ) {
    return "provenance.evidence is invalid";
  }
  for (let index = 0; index < value.provenance.evidence.length; index += 1) {
    const error = validateEvidenceReceipt(
      value.provenance.evidence[index],
      `provenance.evidence[${index}]`
    );
    if (error) return error;
  }
  return null;
}

/** Return whether a value satisfies the complete handoff contract. */
export function isNaruonRehearsalHandoff(value: unknown): value is NaruonRehearsalHandoff {
  return validateNaruonRehearsalHandoff(value) === null;
}

/** Parse and canonicalize an unknown handoff, throwing on contract violations. */
export function parseNaruonRehearsalHandoff(value: unknown): NaruonRehearsalHandoff {
  const error = validateNaruonRehearsalHandoff(value);
  if (error || !isRecord(value)) {
    throw new TypeError(`Invalid naruon rehearsal handoff: ${error ?? "root must be an object"}`);
  }
  const source = value.source as NaruonHandoffSource;
  const normGroup = value.normGroup as NaruonBandNormGroup;
  const event = value.event as NaruonRehearsalEvent;
  const commitment = value.commitment as NaruonRehearsalCommitment;
  const provenance = value.provenance as NaruonHandoffProvenance;
  return {
    artifactKind: NARUON_REHEARSAL_HANDOFF_KIND,
    artifactVersion: NARUON_REHEARSAL_HANDOFF_VERSION,
    createdAt: value.createdAt as string,
    source: { ...source },
    normGroup: { ...normGroup },
    event: event.venue === undefined ? {
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timeZone: event.timeZone
    } : { ...event },
    commitment: { ...commitment },
    provenance: {
      sourceRecordId: provenance.sourceRecordId,
      confidence: provenance.confidence,
      evidence: provenance.evidence.map((receipt) => ({ ...receipt }))
    }
  };
}

/** Build a canonical versioned handoff from application-owned fields. */
export function createNaruonRehearsalHandoff(
  input: CreateNaruonRehearsalHandoffInput
): NaruonRehearsalHandoff {
  return parseNaruonRehearsalHandoff({
    artifactKind: NARUON_REHEARSAL_HANDOFF_KIND,
    artifactVersion: NARUON_REHEARSAL_HANDOFF_VERSION,
    ...input
  });
}

/** Serialize a validated handoff as deterministic newline-terminated JSON. */
export function serializeNaruonRehearsalHandoff(value: unknown): string {
  return `${JSON.stringify(parseNaruonRehearsalHandoff(value))}\n`;
}

/** Parse JSON text and validate the resulting handoff at the same trust boundary. */
export function deserializeNaruonRehearsalHandoff(serialized: string): NaruonRehearsalHandoff {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown JSON error";
    throw new TypeError(`Invalid naruon rehearsal handoff JSON: ${detail}`);
  }
  return parseNaruonRehearsalHandoff(value);
}
