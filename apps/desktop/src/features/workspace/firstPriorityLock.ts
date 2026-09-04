import type { RehearsalPriority, RehearsalSong } from "@bandscope/shared-types";
import { meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named high or medium rehearsal priority on the map. */
export type FirstPriorityLock = {
  sectionLabel: string;
  roleName: string;
  priority: Extract<RehearsalPriority, "high" | "medium">;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Admit only own-property high or medium rehearsal priorities. */
function namedPriority(value: unknown): FirstPriorityLock["priority"] | null {
  if (!isRuntimeObject(value) || !Object.prototype.hasOwnProperty.call(value, "rehearsalPriority")) {
    return null;
  }
  const priority = value.rehearsalPriority;
  if (priority === "high" || priority === "medium") {
    return priority;
  }
  return null;
}

/**
 * Pick the first high-priority part a player should lock before the next section.
 *
 * Prefers a named high-priority entrance so the board names the lock-in that
 * will waste rehearsal time if it slips. Falls back to the first named medium
 * priority when no high-priority part is present. Low-priority parts are never
 * tonight's first lock-in. Runtime roots and collection members are treated as
 * untrusted; inherited or malformed evidence is isolated instead of becoming
 * rehearsal-priority authority.
 */
export function firstPriorityLock(
  song: RehearsalSong | unknown,
  activeRole: string | null = null
): FirstPriorityLock | null {
  if (!isRuntimeObject(song) || !Array.isArray(song.sections)) {
    return null;
  }

  let fallback: FirstPriorityLock | null = null;

  for (const sectionValue of song.sections) {
    if (!isRuntimeObject(sectionValue) || !Array.isArray(sectionValue.roles)) {
      continue;
    }
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (!sectionLabel) {
      continue;
    }

    for (const roleValue of sectionValue.roles) {
      if (!isRuntimeObject(roleValue)) {
        continue;
      }
      if (
        !Object.prototype.hasOwnProperty.call(roleValue, "id") ||
        !Object.prototype.hasOwnProperty.call(roleValue, "name")
      ) {
        continue;
      }
      const roleId = meaningfulRangeText(roleValue.id);
      const roleName = meaningfulRangeText(roleValue.name);
      if (!roleId || !roleName || (activeRole && roleId !== activeRole)) {
        continue;
      }

      const priority = namedPriority(roleValue);
      if (!priority) {
        continue;
      }

      const candidate: FirstPriorityLock = {
        sectionLabel,
        roleName,
        priority
      };

      if (priority === "high") {
        return candidate;
      }

      if (!fallback) {
        fallback = candidate;
      }
    }
  }

  return fallback;
}
