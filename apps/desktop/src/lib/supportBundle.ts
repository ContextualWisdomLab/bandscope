export /** Maximum diagnostic events accepted by one support manifest. */
const MAX_SUPPORT_BUNDLE_EVENTS = 128;

const MAX_TOKEN_LENGTH = 128;
const MAX_DURATION_MS = 86_400_000;
const MAX_QUEUE_DEPTH = 100_000;
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const CREDENTIAL_PREFIX_PATTERN =
  /(?:^|[._:-])(?:gh[pousr]_|github_pat_|sk-|xox[baprs]-|glpat-|AIza[A-Za-z0-9_-]{20,}|(?:AKIA|ASIA)[0-9A-Z]{16}|[sr]k_(?:live|test)_)/i;
const WINDOWS_DRIVE_RELATIVE_PATH_PATTERN = /^[A-Za-z]:/;
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

/** Returns whether a runtime value is a record rather than an array or null. */
function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  try {
    return !Array.isArray(value);
  } catch {
    return false;
  }
}

/** Reads one own untrusted runtime property once and contains accessor failures. */
function readProperty(record: Record<string, unknown>, key: string): unknown {
  try {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      return undefined;
    }
    return record[key];
  } catch {
    return invalid();
  }
}

/** Snapshots a bounded untrusted array without invoking caller-controlled iteration. */
function snapshotBoundedArray(value: unknown, maximum: number): unknown[] {
  let isArray: boolean;
  try {
    isArray = Array.isArray(value);
  } catch {
    return invalid();
  }
  if (!isArray) {
    return invalid();
  }

  let length: number;
  try {
    length = (value as unknown[]).length;
  } catch {
    return invalid();
  }
  if (!Number.isSafeInteger(length) || length > maximum) {
    return invalid();
  }

  const snapshot: unknown[] = [];
  try {
    for (let index = 0; index < length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        return invalid();
      }
      snapshot.push((value as unknown[])[index]);
    }
  } catch {
    return invalid();
  }
  if (snapshot.length !== length) {
    return invalid();
  }
  return snapshot;
}

/** Validates one bounded non-secret, non-path identifier-like token without coercion. */
function safeToken(value: unknown, pattern = TOKEN_PATTERN): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_TOKEN_LENGTH ||
    !pattern.test(value) ||
    CREDENTIAL_PREFIX_PATTERN.test(value) ||
    WINDOWS_DRIVE_RELATIVE_PATH_PATTERN.test(value)
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
  const value = readProperty(record, key);
  return value === undefined ? undefined : safeToken(value);
}

/** Reads one optional allowlisted bounded integer field. */
function optionalInteger(
  record: Record<string, unknown>,
  key: string,
  maximum: number
): number | undefined {
  const value = readProperty(record, key);
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

  const eventId = readProperty(value, "eventId");
  const severityValue = readProperty(value, "severity");
  const stage = readProperty(value, "stage");
  const component = readProperty(value, "component");
  const retryable = readProperty(value, "retryable");
  const nextAction = readProperty(value, "nextAction");
  const correlationId = readProperty(value, "correlationId");
  const sequence = readProperty(value, "sequence");
  const rawFields = readProperty(value, "fields");

  const severity = safeToken(severityValue);
  if (!SEVERITIES.has(severity as SupportBundleEvent["severity"])) {
    return invalid();
  }
  if (typeof retryable !== "boolean") {
    return invalid();
  }

  return {
    eventId: safeToken(eventId),
    severity: severity as SupportBundleEvent["severity"],
    stage: safeToken(stage),
    component: safeToken(component),
    retryable,
    nextAction: safeToken(nextAction),
    correlationId: safeToken(correlationId),
    sequence: safeBoundedInteger(sequence, Number.MAX_SAFE_INTEGER),
    fields: parseFields(rawFields)
  };
}

/** Copies one already-minimized event so callers cannot mutate retained diagnostic evidence. */
function copyEvent(event: SupportBundleEvent): SupportBundleEvent {
  return { ...event, fields: { ...event.fields } };
}

/**
 * Bounded local store for privacy-minimized support diagnostics.
 *
 * Events are validated before mutation, must arrive with strictly increasing sequence authority,
 * and are copied back out so UI/report consumers cannot rewrite retained evidence. The capacity is
 * capped at the same 128-event manifest boundary, keeping later offline bundle creation bounded.
 */
export class SupportDiagnosticBuffer {
  private readonly capacity: number;
  private readonly events: SupportBundleEvent[] = [];
  private lastSequence: number | null = null;

  /** Creates a bounded diagnostic buffer with the manifest's maximum event capacity. */
  constructor(capacity = MAX_SUPPORT_BUNDLE_EVENTS) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > MAX_SUPPORT_BUNDLE_EVENTS) {
      return invalid();
    }
    this.capacity = capacity;
  }

  /** Validates and records one event without retaining arbitrary runtime payloads. */
  record(value: unknown): void {
    const event = parseEvent(value);
    if (this.lastSequence !== null && event.sequence <= this.lastSequence) {
      return invalid();
    }

    this.lastSequence = event.sequence;
    this.events.push(event);
    if (this.events.length > this.capacity) {
      this.events.shift();
    }
  }

  /** Returns a detached ordered snapshot suitable for manifest construction or local preview. */
  snapshot(): SupportBundleEvent[] {
    return this.events.map(copyEvent);
  }
}

/** Returns whether a Gregorian year contains February 29. */
function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Returns the maximum valid day number for a validated Gregorian month. */
function maximumDayForMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** Validates the manifest's canonical UTC RFC 3339 timestamp profile. */
function parseGeneratedAt(value: unknown): string {
  if (typeof value !== "string" || value.length > 40 || !RFC3339_UTC_PATTERN.test(value)) {
    return invalid();
  }

  const year = Number.parseInt(value.slice(0, 4), 10);
  const month = Number.parseInt(value.slice(5, 7), 10);
  const day = Number.parseInt(value.slice(8, 10), 10);
  const hour = Number.parseInt(value.slice(11, 13), 10);
  const minute = Number.parseInt(value.slice(14, 16), 10);
  const second = Number.parseInt(value.slice(17, 19), 10);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > maximumDayForMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
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
 * discarded rather than post-hoc masked. Every serialized token also rejects high-confidence
 * credential prefixes at token start or after an allowed structural delimiter before it can enter
 * either the machine or human support representation. Windows drive-relative path tokens are also
 * rejected while ordinary multi-letter device identifiers such as `cuda:0` remain valid.
 */
export function buildSupportBundleManifest(input: unknown): SupportBundleManifest {
  if (!isRecord(input)) {
    return invalid();
  }

  const appValue = readProperty(input, "app");
  const generatedAt = readProperty(input, "generatedAt");
  const rawEvents = readProperty(input, "events");
  if (!isRecord(appValue)) {
    return invalid();
  }
  const eventValues = snapshotBoundedArray(rawEvents, MAX_SUPPORT_BUNDLE_EVENTS);
  const events = eventValues.map(parseEvent);

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
    generatedAt: parseGeneratedAt(generatedAt),
    app: {
      version: safeToken(readProperty(appValue, "version")),
      sourceRevision: safeToken(readProperty(appValue, "sourceRevision"), REVISION_PATTERN),
      buildId: safeToken(readProperty(appValue, "buildId")),
      platform: safeToken(readProperty(appValue, "platform")),
      architecture: safeToken(readProperty(appValue, "architecture"))
    },
    events
  };
}

/** Formats one already-minimized event without consulting caller-owned diagnostic payloads. */
function renderSupportBundleEvent(event: SupportBundleEvent): string {
  const structuredFields = Object.entries(event.fields).map(
    ([key, value]) => `${key}=${String(value)}`
  );

  return [
    `${event.sequence}. [${event.severity}] ${event.component}/${event.stage} ${event.eventId}`,
    `next=${event.nextAction}`,
    `retryable=${event.retryable ? "yes" : "no"}`,
    `correlation=${event.correlationId}`,
    ...structuredFields
  ].join(" | ");
}

/**
 * Renders a deterministic human-readable report from the privacy-minimized manifest model.
 *
 * The report is deliberately derived from `buildSupportBundleManifest()` rather than from raw
 * runtime diagnostics, so paths, URLs, messages, stacks, environment values, subprocess arguments,
 * audio, and project payloads that have no allowlisted manifest slot cannot re-enter human output.
 */
export function renderSupportBundleReport(input: unknown): string {
  const manifest = buildSupportBundleManifest(input);
  return [
    "BandScope support report",
    `Schema: ${manifest.schema} v${manifest.schemaVersion}`,
    `Generated: ${manifest.generatedAt}`,
    `Build: ${manifest.app.version} | ${manifest.app.buildId}`,
    `Source: ${manifest.app.sourceRevision}`,
    `Platform: ${manifest.app.platform}/${manifest.app.architecture}`,
    `Events: ${manifest.events.length}`,
    ...manifest.events.map(renderSupportBundleEvent),
    ""
  ].join("\n");
}

/** Serializes a support manifest with stable formatting and a final newline for file tooling. */
export function serializeSupportBundleManifest(input: unknown): string {
  return `${JSON.stringify(buildSupportBundleManifest(input), null, 2)}\n`;
}
