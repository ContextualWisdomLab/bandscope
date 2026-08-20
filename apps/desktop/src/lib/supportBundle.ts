export /** Maximum diagnostic events accepted by one support manifest. */
const MAX_SUPPORT_BUNDLE_EVENTS = 128;

const MAX_TOKEN_LENGTH = 128;
const MAX_DURATION_MS = 86_400_000;
const MAX_QUEUE_DEPTH = 100_000;
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const REVISION_PATTERN = /^[0-9a-f]{40}$/i;
const RFC3339_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const SEVERITIES = new Set(["debug", "info", "warning", "error"] as const);

/** Allowlisted structured evidence that may enter an offline support manifest. */
export interface SupportBundleEventFields {
  errorClass?: string;
  backend?: string;
  device?: string;
  codec?: string;
  durationMs?: number;
  queueDepth?: number;
}

/** Privacy-minimized diagnostic event stored in sequence order. */
export interface SupportBundleEvent {
  eventId: string;
  severity: "debug" | "info" | "warning" | "error";
  stage: string;
  component: string;
  retryable: boolean;
  nextAction: string;
  correlationId: string;
  sequence: number;
  fields: SupportBundleEventFields;
}

/** Deterministic schema-v1 inventory for a future offline support archive. */
export interface SupportBundleManifest {
  schema: "bandscope.support-bundle-manifest";
  schemaVersion: 1;
  generatedAt: string;
  app: {
    version: string;
    sourceRevision: string;
    buildId: string;
    platform: string;
    architecture: string;
  };
  events: SupportBundleEvent[];
}

/** Raises the stable fail-closed error for malformed support evidence. */
function invalid(): never {
  throw new Error("Invalid support bundle input");
}

/** Returns whether a runtime value is a plain record rather than an array or null. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates one bounded identifier-like token without coercion. */
function safeToken(value: unknown, pattern = TOKEN_PATTERN): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_TOKEN_LENGTH ||
    !pattern.test(value)
  ) {
    return invalid();
  }
  return value;
}

/** Validates one bounded non-negative integer without Boolean or string coercion. */
function safeBoundedInteger(value: unknown, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximum
  ) {
    return invalid();
  }
  return value;
}

/** Reads one optional allowlisted string field. */
function optionalToken(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return value === undefined ? undefined : safeToken(value);
}

/** Reads one optional allowlisted bounded integer field. */
function optionalInteger(
  record: Record<string, unknown>,
  key: string,
  maximum: number
): number | undefined {
  const value = record[key];
  return value === undefined ? undefined : safeBoundedInteger(value, maximum);
}

/** Projects runtime diagnostic fields onto the explicit privacy allowlist. */
function parseFields(value: unknown): SupportBundleEventFields {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    return invalid();
  }

  const fields: SupportBundleEventFields = {};
  const errorClass = optionalToken(value, "errorClass");
  const backend = optionalToken(value, "backend");
  const device = optionalToken(value, "device");
  const codec = optionalToken(value, "codec");
  const durationMs = optionalInteger(value, "durationMs", MAX_DURATION_MS);
  const queueDepth = optionalInteger(value, "queueDepth", MAX_QUEUE_DEPTH);

  if (errorClass !== undefined) fields.errorClass = errorClass;
  if (backend !== undefined) fields.backend = backend;
  if (device !== undefined) fields.device = device;
  if (codec !== undefined) fields.codec = codec;
  if (durationMs !== undefined) fields.durationMs = durationMs;
  if (queueDepth !== undefined) fields.queueDepth = queueDepth;

  return fields;
}

/** Validates and minimizes one runtime diagnostic event. */
function parseEvent(value: unknown): SupportBundleEvent {
  if (!isRecord(value)) {
    return invalid();
  }

  const severity = safeToken(value.severity);
  if (!SEVERITIES.has(severity as SupportBundleEvent["severity"])) {
    return invalid();
  }
  if (typeof value.retryable !== "boolean") {
    return invalid();
  }

  return {
    eventId: safeToken(value.eventId),
    severity: severity as SupportBundleEvent["severity"],
    stage: safeToken(value.stage),
    component: safeToken(value.component),
    retryable: value.retryable,
    nextAction: safeToken(value.nextAction),
    correlationId: safeToken(value.correlationId),
    sequence: safeBoundedInteger(value.sequence, Number.MAX_SAFE_INTEGER),
    fields: parseFields(value.fields)
  };
}

/** Validates the manifest's canonical UTC RFC 3339 timestamp profile. */
function parseGeneratedAt(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    !RFC3339_UTC_PATTERN.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    return invalid();
  }
  return value;
}

/**
 * Builds the deterministic, privacy-minimized manifest used by offline support tooling.
 *
 * The input is intentionally accepted as unknown because runtime diagnostics are a trust boundary.
 * Only explicitly modeled fields are copied. Arbitrary messages, stacks, paths, URLs, environment
 * variables, subprocess arguments, audio, project payloads, and other caller-owned properties are
 * discarded rather than post-hoc masked.
 */
export function buildSupportBundleManifest(input: unknown): SupportBundleManifest {
  if (!isRecord(input) || !isRecord(input.app) || !Array.isArray(input.events)) {
    return invalid();
  }
  if (input.events.length > MAX_SUPPORT_BUNDLE_EVENTS) {
    return invalid();
  }

  const events = input.events.map(parseEvent);
  const sequences = new Set<number>();
  for (const event of events) {
    if (sequences.has(event.sequence)) {
      return invalid();
    }
    sequences.add(event.sequence);
  }
  events.sort((left, right) => left.sequence - right.sequence);

  return {
    schema: "bandscope.support-bundle-manifest",
    schemaVersion: 1,
    generatedAt: parseGeneratedAt(input.generatedAt),
    app: {
      version: safeToken(input.app.version),
      sourceRevision: safeToken(input.app.sourceRevision, REVISION_PATTERN),
      buildId: safeToken(input.app.buildId),
      platform: safeToken(input.app.platform),
      architecture: safeToken(input.app.architecture)
    },
    events
  };
}

/** Serializes a support manifest with stable formatting and a final newline for file tooling. */
export function serializeSupportBundleManifest(input: unknown): string {
  return `${JSON.stringify(buildSupportBundleManifest(input), null, 2)}\n`;
}
