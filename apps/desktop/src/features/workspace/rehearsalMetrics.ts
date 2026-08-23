import {
  MAX_SECTION_TIME_SECONDS,
  SECTION_FORM_LABELS,
  type RehearsalHarmony,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const MAX_REHEARSAL_BPM = 400;
const MAX_CHORD_LENGTH = 32;
const MAX_ROLE_NAME_LENGTH = 80;
const MAX_PLAN_LENGTH = 180;
const SECTION_FORM_LABEL_OWNED: Readonly<Record<string, true>> = Object.freeze(
  Object.fromEntries(SECTION_FORM_LABELS.map((label) => [label, true] as const))
);

export /** Renderer-owned workspace targets for cockpit next actions. */
const WORKSPACE_SURFACE_TEMPO = "workspace-surface-tempo";
export /** Renderer-owned workspace target for the first-entrance chord. */
const WORKSPACE_SURFACE_HARMONY = "workspace-surface-harmony";
export /** Renderer-owned workspace target for tonight's transpose setup. */
const WORKSPACE_SURFACE_TRANSPOSE = "workspace-surface-transpose";

/** Integer BPM the room can count in before the first entrance. */
export type TonightTempo = {
  bpm: number;
};

/** First-entrance chord shape, not a claimed song-wide key. */
export type TonightStartingChord = {
  chord: string;
  roleName: string;
};

/** First-entrance transpose/setup plan for a ranked part. */
export type TonightTransposePlan = {
  plan: string;
  roleName: string;
};

type MetricCopyKey = "bpm" | "chord" | "role" | "plan";

/** Interpolate cockpit placeholders once so rehearsal data is never rescanned as template syntax. */
export function formatMetricCopy(
  template: string,
  values: Readonly<Partial<Record<MetricCopyKey, string>>>
): string {
  return template.replace(/\{(bpm|chord|role|plan)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as MetricCopyKey;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
export function preferredMetricScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Scroll the first renderer-owned surface that actually exists. */
export function scrollToWorkspaceSurface(surfaceIds: readonly string[]): boolean {
  for (const surfaceId of surfaceIds) {
    if (typeof surfaceId !== "string" || surfaceId.trim().length === 0) {
      continue;
    }
    const target = document.getElementById(surfaceId);
    if (typeof target?.scrollIntoView !== "function") {
      continue;
    }
    target.scrollIntoView({
      block: "nearest",
      behavior: preferredMetricScrollBehavior()
    });
    return true;
  }
  return false;
}

/** Compare opaque ids by Unicode code units so tie-breaking never depends on host locale. */
function compareStableId(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

/** Return whether an untrusted runtime value can be inspected as a record. */
function isRuntimeObject(value: unknown): value is object {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Return whether a runtime record owns the named field without letting Proxy traps escape. */
function hasOwn(value: object, key: PropertyKey): boolean {
  try {
    return Object.prototype.hasOwnProperty.call(value, key);
  } catch {
    return false;
  }
}

/** Read an own data property without invoking accessors or letting Proxy descriptor traps escape. */
function readOwnDataProperty(value: object, key: PropertyKey): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

/** Return whether materialized enumerable keys exactly cover a runtime array's numeric indices. */
function isDenseRuntimeArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) {
    return false;
  }
  try {
    const length = Number(value.length);
    if (!Number.isSafeInteger(length) || length < 0 || length > 0xffffffff) {
      return false;
    }
    const keys = Object.keys(value);
    return keys.length === length && keys.every((key, index) => key === String(index));
  } catch {
    return false;
  }
}

/** Return a bounded non-empty own data string, or null. */
function readBoundedOwnString(record: object, key: PropertyKey, maxLength: number): string | null {
  const value = readOwnDataProperty(record, key);
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength || /[\r\n]/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/** Return whether the role has safe owned identity/copy and ranked rehearsal priority. */
function hasRankedPriority(role: RehearsalRole): boolean {
  return (
    readBoundedOwnString(role, "id", MAX_ROLE_NAME_LENGTH) !== null &&
    readBoundedOwnString(role, "name", MAX_ROLE_NAME_LENGTH) !== null &&
    hasOwn(role, "rehearsalPriority") &&
    Object.prototype.hasOwnProperty.call(PRIORITY_RANK, role.rehearsalPriority)
  );
}

/** Return whether a section owns a bounded, positive-length integer rehearsal window. */
function hasBoundedTimeRange(section: RehearsalSection): boolean {
  const timeRange = readOwnDataProperty(section, "timeRange");
  if (!isRuntimeObject(timeRange)) {
    return false;
  }

  const start = readOwnDataProperty(timeRange, "start");
  const end = readOwnDataProperty(timeRange, "end");
  return (
    typeof start === "number" &&
    Number.isInteger(start) &&
    start >= 0 &&
    start <= MAX_SECTION_TIME_SECONDS &&
    typeof end === "number" &&
    Number.isInteger(end) &&
    end > start &&
    end <= MAX_SECTION_TIME_SECONDS
  );
}

/** Return safe identities that appear more than once in one section-local collection. */
function repeatedIds(ids: string[]): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      repeated.add(id);
    } else {
      seen.add(id);
    }
  }
  return repeated;
}

/** Prefer the highest-priority ranked role, then a locale-independent stable id order. */
function sortRankedRoles(roles: RehearsalRole[]): RehearsalRole[] {
  return [...roles].sort((left, right) => {
    const rankDelta = PRIORITY_RANK[left.rehearsalPriority] - PRIORITY_RANK[right.rehearsalPriority];
    if (rankDelta !== 0) {
      return rankDelta;
    }
    return compareStableId(left.id, right.id);
  });
}

/** Return ranked roles whose unique graph node is explicitly active. */
function rankedActiveRoles(section: RehearsalSection): RehearsalRole[] {
  if (
    !hasOwn(section, "roles") ||
    !hasOwn(section, "partGraph") ||
    !isDenseRuntimeArray(section.roles) ||
    !isDenseRuntimeArray(section.partGraph)
  ) {
    return [];
  }

  const safeRoleIds = section.roles
    .filter(
      (role) =>
        isRuntimeObject(role) && readBoundedOwnString(role, "id", MAX_ROLE_NAME_LENGTH) !== null
    )
    .map((role) => role.id);
  const safeGraphRoleIds = section.partGraph
    .filter(
      (node) =>
        isRuntimeObject(node) &&
        hasOwn(node, "role_id") &&
        typeof node.role_id === "string" &&
        node.role_id.trim().length > 0
    )
    .map((node) => node.role_id);
  const repeatedRoleIds = repeatedIds(safeRoleIds);
  const repeatedGraphRoleIds = repeatedIds(safeGraphRoleIds);
  const activeIds = new Set(
    section.partGraph
      .filter(
        (node) =>
          isRuntimeObject(node) &&
          hasOwn(node, "is_active") &&
          node.is_active === true &&
          hasOwn(node, "role_id") &&
          typeof node.role_id === "string" &&
          node.role_id.trim().length > 0 &&
          !repeatedGraphRoleIds.has(node.role_id)
      )
      .map((node) => node.role_id)
  );

  return sortRankedRoles(
    section.roles.filter(
      (role) =>
        isRuntimeObject(role) &&
        hasRankedPriority(role) &&
        !repeatedRoleIds.has(role.id) &&
        activeIds.has(role.id)
    )
  );
}

/** Return a safe chord symbol from an owned harmony record. */
function readChord(harmony: object): string | null {
  return readBoundedOwnString(harmony, "chord", MAX_CHORD_LENGTH);
}

/** Prefer a user harmony override, then the role's owned model chord. */
function roleChord(role: RehearsalRole): string | null {
  if (hasOwn(role, "manualOverrides") && isDenseRuntimeArray(role.manualOverrides)) {
    for (const item of role.manualOverrides) {
      if (!isRuntimeObject(item) || !hasOwn(item, "field") || item.field !== "harmony") {
        continue;
      }
      if (!hasOwn(item, "source") || item.source !== "user") {
        continue;
      }
      if (!hasOwn(item, "value") || !isRuntimeObject(item.value)) {
        continue;
      }
      const overridden = readChord(item.value as RehearsalHarmony);
      if (overridden) {
        return overridden;
      }
    }
  }
  if (!hasOwn(role, "harmony") || !isRuntimeObject(role.harmony)) {
    return null;
  }
  return readChord(role.harmony);
}

/** Return the first safe first-entrance section, or null. */
function firstEntranceSection(song: RehearsalSong): RehearsalSection | null {
  if (!isRuntimeObject(song) || !hasOwn(song, "sections") || !isDenseRuntimeArray(song.sections)) {
    return null;
  }

  const sections = song.sections
    .filter(
      (section) =>
        isRuntimeObject(section) &&
        readBoundedOwnString(section, "id", MAX_ROLE_NAME_LENGTH) !== null &&
        hasOwn(section, "label") &&
        typeof section.label === "string" &&
        Object.prototype.hasOwnProperty.call(SECTION_FORM_LABEL_OWNED, section.label) &&
        hasBoundedTimeRange(section)
    )
    .sort((left, right) => {
      if (left.timeRange.start !== right.timeRange.start) {
        return left.timeRange.start - right.timeRange.start;
      }
      return compareStableId(left.id, right.id);
    });

  return sections[0] ?? null;
}

/** Return tonight's countable BPM, or null when the value is not a rehearsal tempo. */
export function resolveTonightTempo(song: RehearsalSong | null | undefined): TonightTempo | null {
  if (!isRuntimeObject(song)) {
    return null;
  }
  const bpm = readOwnDataProperty(song, "tempo");
  if (
    typeof bpm !== "number" ||
    !Number.isInteger(bpm) ||
    bpm <= 0 ||
    bpm > MAX_REHEARSAL_BPM
  ) {
    return null;
  }
  return { bpm };
}

/** Return the first-entrance chord shape, or null when no safe chord remains. */
export function resolveTonightStartingChord(
  song: RehearsalSong | null | undefined
): TonightStartingChord | null {
  const section = firstEntranceSection(song as RehearsalSong);
  if (!section) {
    return null;
  }
  for (const role of rankedActiveRoles(section)) {
    const chord = roleChord(role);
    const roleName = readBoundedOwnString(role, "name", MAX_ROLE_NAME_LENGTH);
    if (chord && roleName) {
      return { chord, roleName };
    }
  }
  return null;
}

/** Return the first-entrance transpose plan, or null when no setup note remains. */
export function resolveTonightTransposePlan(
  song: RehearsalSong | null | undefined
): TonightTransposePlan | null {
  const section = firstEntranceSection(song as RehearsalSong);
  if (!section) {
    return null;
  }
  for (const role of rankedActiveRoles(section)) {
    const plan = readBoundedOwnString(role, "transpositionPlan", MAX_PLAN_LENGTH);
    const roleName = readBoundedOwnString(role, "name", MAX_ROLE_NAME_LENGTH);
    if (plan && roleName) {
      return { plan, roleName };
    }
  }
  return null;
}
