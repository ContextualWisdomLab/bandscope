import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named part that still has no stored practice mark. */
export type FirstUnloggedPractice = {
  sectionLabel: string;
  roleName: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return whether a role already owns a 0–100 integer practice mark. */
export function hasLoggedPracticeProgress(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

/**
 * Pick the first named part that still needs tonight's first practice mark.
 *
 * Missing `practiceProgress` is unlogged. Out-of-range or non-integer marks are
 * not authority and are skipped. Runtime roots and collection members are
 * untrusted; malformed evidence fails closed instead of naming a pass.
 */
export function firstUnloggedPractice(
  song: RehearsalSong,
  activeRole: string | null = null
): FirstUnloggedPractice | null {
  const runtimeSong: unknown = song;
  if (!isRuntimeObject(runtimeSong) || !Array.isArray(runtimeSong.sections)) {
    return null;
  }

  const seenRoleIds = new Set<string>();
  const repeatedRoleIds = new Set<string>();

  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue) || !Array.isArray(sectionValue.roles)) {
      continue;
    }
    for (const roleValue of sectionValue.roles) {
      if (!isRuntimeObject(roleValue)) {
        continue;
      }
      const roleId = meaningfulRangeText(roleValue.id);
      if (!roleId) {
        continue;
      }
      if (seenRoleIds.has(roleId)) {
        repeatedRoleIds.add(roleId);
      } else {
        seenRoleIds.add(roleId);
      }
    }
  }

  for (const sectionValue of runtimeSong.sections) {
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
      const roleId = meaningfulRangeText(roleValue.id);
      const roleName = meaningfulRangeText(roleValue.name);
      if (!roleId || !roleName || repeatedRoleIds.has(roleId)) {
        continue;
      }
      if (activeRole && roleId !== activeRole) {
        continue;
      }
      if (hasLoggedPracticeProgress(roleValue.practiceProgress)) {
        continue;
      }
      if (roleValue.practiceProgress !== undefined && !hasLoggedPracticeProgress(roleValue.practiceProgress)) {
        continue;
      }
      return { sectionLabel, roleName };
    }
  }

  return null;
}

/** Fill trusted `{token}` placeholders for unlogged-practice copy. */
export function fillUnloggedPracticeCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
