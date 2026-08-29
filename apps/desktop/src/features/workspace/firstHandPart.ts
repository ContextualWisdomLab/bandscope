import type { RehearsalSong } from "@bandscope/shared-types";
import { meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named keyboard-hand part on the rehearsal map. */
export type FirstHandPart = {
  sectionLabel: string;
  roleName: string;
  overlapWarning?: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return whether an object graph exposes only own data properties. */
function hasDataPropertyGraph(
  value: unknown,
  seen = new WeakSet<object>()
): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  if (seen.has(value)) {
    return true;
  }
  seen.add(value);

  let keys: (string | symbol)[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  for (const key of keys) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return false;
    }
    if (!descriptor || !("value" in descriptor) || !hasDataPropertyGraph(descriptor.value, seen)) {
      return false;
    }
  }
  return true;
}

/** Reject accessor-bearing graphs and Proxy containers before reading evidence. */
function isSafeRuntimeValue(value: unknown): boolean {
  if (!hasDataPropertyGraph(value)) {
    return false;
  }
  try {
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

/** Read one own data-property value without invoking accessors or inherited getters. */
function ownDataValue(record: Record<string, unknown>, property: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, property);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

/** Snapshot own array slots without invoking index or iteration getters. */
function ownArrayValues(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  let lengthDescriptor: PropertyDescriptor | undefined;
  try {
    lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  } catch {
    return null;
  }
  const length =
    lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : undefined;
  if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) {
    return null;
  }

  const values: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor && "value" in descriptor) {
        values.push(descriptor.value);
      }
    } catch {
      return null;
    }
  }
  return values;
}

/** Return whether a role record is a hand-specific extraction target. */
function isHandRole(roleValue: Record<string, unknown>): boolean {
  return ownDataValue(roleValue, "roleType") === "hand";
}

/**
 * Return the first occurrence of a selected role id, or `undefined` when absent.
 *
 * Runtime collections are untrusted. A missing selected id must fail closed so
 * a stale filter cannot become hand-part authority for a different player.
 */
function selectedRoleRecord(
  sections: unknown[],
  activeRole: string
): Record<string, unknown> | undefined {
  for (const sectionValue of sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const roles = ownArrayValues(ownDataValue(sectionValue, "roles"));
    if (roles === null) {
      continue;
    }
    for (const roleValue of roles) {
      if (!isRuntimeObject(roleValue)) {
        continue;
      }
      const roleId = meaningfulRangeText(ownDataValue(roleValue, "id"));
      if (roleId === activeRole) {
        return roleValue;
      }
    }
  }
  return undefined;
}

/**
 * Pick the first hand part a keyboard player should lock in before the next section.
 *
 * Prefers a named left/right-hand role that also carries a clash warning so the
 * board names the voicing that will waste rehearsal time. Falls back to the
 * first named hand part when no clash is present. Selecting a non-hand role
 * still names the song-level first hand so the rest of the band can hear that
 * voicing. Selecting a missing role fails closed. Runtime roots and collection
 * members are treated as untrusted; malformed evidence is isolated instead of
 * becoming hand-part authority.
 */
export function firstHandPart(
  song: RehearsalSong,
  activeRole: string | null = null
): FirstHandPart | null {
  const runtimeSong: unknown = song;
  if (!isRuntimeObject(runtimeSong) || !isSafeRuntimeValue(runtimeSong)) {
    return null;
  }

  const sections = ownArrayValues(ownDataValue(runtimeSong, "sections"));
  if (sections === null) {
    return null;
  }

  let selectedHandRoleId: string | null = null;
  if (activeRole) {
    const selected = selectedRoleRecord(sections, activeRole);
    if (!selected) {
      return null;
    }
    if (isHandRole(selected)) {
      selectedHandRoleId = activeRole;
    }
  }

  let fallback: FirstHandPart | null = null;

  for (const sectionValue of sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const roles = ownArrayValues(ownDataValue(sectionValue, "roles"));
    if (roles === null) {
      continue;
    }
    const sectionLabel = meaningfulRangeText(ownDataValue(sectionValue, "label"));
    if (!sectionLabel) {
      continue;
    }

    for (const roleValue of roles) {
      if (!isRuntimeObject(roleValue) || !isHandRole(roleValue)) {
        continue;
      }
      const roleId = meaningfulRangeText(ownDataValue(roleValue, "id"));
      const roleName = meaningfulRangeText(ownDataValue(roleValue, "name"));
      if (!roleId || !roleName || (selectedHandRoleId && roleId !== selectedHandRoleId)) {
        continue;
      }

      let overlapWarning: string | undefined;
      const overlapWarnings = ownArrayValues(ownDataValue(roleValue, "overlapWarnings"));
      if (overlapWarnings !== null) {
        for (const warning of overlapWarnings) {
          const meaningfulWarning = meaningfulRangeText(warning);
          if (meaningfulWarning) {
            overlapWarning = meaningfulWarning;
            break;
          }
        }
      }

      const candidate: FirstHandPart = {
        sectionLabel,
        roleName,
        overlapWarning
      };

      if (overlapWarning) {
        return candidate;
      }

      if (!fallback) {
        fallback = candidate;
      }
    }
  }

  return fallback;
}
