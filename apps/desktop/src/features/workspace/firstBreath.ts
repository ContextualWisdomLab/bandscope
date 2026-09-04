import type { RehearsalSong } from "@bandscope/shared-types";
import { meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named last-line breath the band should take together. */
export type FirstBreath = {
  sectionLabel: string;
  endTime: string;
};

const MAX_SECTION_TIME_SECONDS = 4_294_967_295;

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Format a bounded section end as `m:ss`, or fail closed.
 *
 * Rejects non-numbers, non-finite values, negatives, and ends above the
 * shared section-time ceiling so a malformed payload cannot become a
 * rehearsal breath cue.
 */
export function formatBreathTime(totalSeconds: unknown): string | null {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return null;
  }
  if (totalSeconds > MAX_SECTION_TIME_SECONDS) {
    return null;
  }
  const whole = Math.floor(totalSeconds);
  const minutes = Math.floor(whole / 60);
  const seconds = (whole % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Admit an own-property boolean `is_active` flag. Inherited evidence is isolated. */
function isOwnActive(value: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(value, "is_active") && value.is_active === true;
}

/**
 * Return whether the selected part is on this section's last-line breath.
 *
 * Prefers own-property `partGraph` activity so a sit-out is not sold as a
 * breathe-together cue. Falls back to a named role on the section when no
 * graph node exists.
 */
function sectionIncludesActiveRole(
  sectionValue: Record<string, unknown>,
  activeRole: string
): boolean {
  if (Array.isArray(sectionValue.partGraph)) {
    let sawSelectedNode = false;
    for (const nodeValue of sectionValue.partGraph) {
      if (
        !isRuntimeObject(nodeValue) ||
        !Object.prototype.hasOwnProperty.call(nodeValue, "role_id")
      ) {
        continue;
      }
      const roleId = meaningfulRangeText(nodeValue.role_id);
      if (roleId !== activeRole) {
        continue;
      }
      sawSelectedNode = true;
      if (isOwnActive(nodeValue)) {
        return true;
      }
    }
    if (sawSelectedNode) {
      return false;
    }
  }

  if (!Array.isArray(sectionValue.roles)) {
    return false;
  }
  for (const roleValue of sectionValue.roles) {
    if (!isRuntimeObject(roleValue) || !Object.prototype.hasOwnProperty.call(roleValue, "id")) {
      continue;
    }
    if (meaningfulRangeText(roleValue.id) === activeRole) {
      return true;
    }
  }
  return false;
}

/**
 * Pick the first named section end a player should breathe before the last line.
 *
 * Uses existing `timeRange.end` authority already produced by analysis.
 * Blank labels, inverted spans, inherited time fields, inactive selected
 * parts, and malformed roots fail closed. When a role is selected, only a
 * section that includes that part as active is named. This is not a
 * count-out, count-in, click, chart bar, or Fine.
 */
export function firstBreath(
  song: RehearsalSong | unknown,
  activeRole: string | null = null
): FirstBreath | null {
  if (!isRuntimeObject(song) || !Array.isArray(song.sections)) {
    return null;
  }

  for (const sectionValue of song.sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (!sectionLabel) {
      continue;
    }
    if (activeRole && !sectionIncludesActiveRole(sectionValue, activeRole)) {
      continue;
    }
    if (
      !isRuntimeObject(sectionValue.timeRange) ||
      !Object.prototype.hasOwnProperty.call(sectionValue.timeRange, "start") ||
      !Object.prototype.hasOwnProperty.call(sectionValue.timeRange, "end")
    ) {
      continue;
    }
    const start = sectionValue.timeRange.start;
    const end = sectionValue.timeRange.end;
    if (typeof start !== "number" || !Number.isFinite(start) || start < 0) {
      continue;
    }
    const endTime = formatBreathTime(end);
    if (!endTime || typeof end !== "number" || end < start) {
      continue;
    }
    return { sectionLabel, endTime };
  }

  return null;
}
