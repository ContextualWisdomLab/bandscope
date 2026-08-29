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

/** Return whether a role record is a hand-specific extraction target. */
function isHandRole(roleValue: Record<string, unknown>): boolean {
  return roleValue.roleType === "hand";
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
    if (!isRuntimeObject(sectionValue) || !Array.isArray(sectionValue.roles)) {
      continue;
    }
    for (const roleValue of sectionValue.roles) {
      if (!isRuntimeObject(roleValue)) {
        continue;
      }
      const roleId = meaningfulRangeText(roleValue.id);
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
  if (!isRuntimeObject(runtimeSong) || !Array.isArray(runtimeSong.sections)) {
    return null;
  }

  let selectedHandRoleId: string | null = null;
  if (activeRole) {
    const selected = selectedRoleRecord(runtimeSong.sections, activeRole);
    if (!selected) {
      return null;
    }
    if (isHandRole(selected)) {
      selectedHandRoleId = activeRole;
    }
  }

  let fallback: FirstHandPart | null = null;

  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue) || !Array.isArray(sectionValue.roles)) {
      continue;
    }
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (!sectionLabel) {
      continue;
    }

    for (const roleValue of sectionValue.roles) {
      if (!isRuntimeObject(roleValue) || !isHandRole(roleValue)) {
        continue;
      }
      const roleId = meaningfulRangeText(roleValue.id);
      const roleName = meaningfulRangeText(roleValue.name);
      if (!roleId || !roleName || (selectedHandRoleId && roleId !== selectedHandRoleId)) {
        continue;
      }

      let overlapWarning: string | undefined;
      if (Array.isArray(roleValue.overlapWarnings)) {
        for (const warning of roleValue.overlapWarnings) {
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
