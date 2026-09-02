import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named part that still has no stored practice mark. */
export type FirstUnloggedPractice = {
  sectionLabel: string;
  roleName: string;
};

type PracticeMark =
  | { kind: "unlogged" }
  | { kind: "logged"; value: number }
  | { kind: "invalid" };

type RoleEvidence = {
  roleName: string;
  firstSectionLabel: string;
  marks: PracticeMark[];
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return whether a record owns a field rather than inheriting it. */
function owns(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

/** Return whether a role already owns a 0–100 integer practice mark. */
export function hasLoggedPracticeProgress(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

/** Admit one role-copy practice mark without granting inherited values authority. */
function practiceMark(roleValue: Record<string, unknown>): PracticeMark {
  if (!owns(roleValue, "practiceProgress")) {
    return { kind: "unlogged" };
  }
  const value = roleValue.practiceProgress;
  if (!hasLoggedPracticeProgress(value)) {
    return { kind: "invalid" };
  }
  return { kind: "logged", value };
}

/** Return whether every section copy agrees that the named part is still unlogged. */
function isConsistentlyUnlogged(marks: PracticeMark[]): boolean {
  return marks.length > 0 && marks.every((mark) => mark.kind === "unlogged");
}

/**
 * Pick the first named part that still needs tonight's first practice mark.
 *
 * The same role id may legitimately appear in several song sections. Those
 * copies are one rehearsal part only when their display name agrees and every
 * copy consistently omits `practiceProgress`. A duplicate id inside one
 * section, conflicting names, mixed logged/unlogged copies, malformed marks,
 * inherited identity, or malformed collection evidence is not authority and
 * cannot produce a rehearsal instruction.
 */
export function firstUnloggedPractice(
  song: RehearsalSong,
  activeRole: string | null = null
): FirstUnloggedPractice | null {
  const runtimeSong: unknown = song;
  if (!isRuntimeObject(runtimeSong) || !owns(runtimeSong, "sections") || !Array.isArray(runtimeSong.sections)) {
    return null;
  }

  const evidenceByRole = new Map<string, RoleEvidence>();
  const roleOrder: string[] = [];
  const invalidRoleIds = new Set<string>();

  for (const sectionValue of runtimeSong.sections) {
    if (
      !isRuntimeObject(sectionValue) ||
      !owns(sectionValue, "label") ||
      !owns(sectionValue, "roles") ||
      !Array.isArray(sectionValue.roles)
    ) {
      return null;
    }

    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (!sectionLabel) {
      return null;
    }

    const sectionRoleIds = new Set<string>();
    for (const roleValue of sectionValue.roles) {
      if (
        !isRuntimeObject(roleValue) ||
        !owns(roleValue, "id") ||
        !owns(roleValue, "name")
      ) {
        continue;
      }

      const roleId = meaningfulRangeText(roleValue.id);
      const roleName = meaningfulRangeText(roleValue.name);
      if (!roleId || !roleName) {
        continue;
      }

      if (sectionRoleIds.has(roleId)) {
        invalidRoleIds.add(roleId);
        continue;
      }
      sectionRoleIds.add(roleId);

      const existing = evidenceByRole.get(roleId);
      if (!existing) {
        evidenceByRole.set(roleId, {
          roleName,
          firstSectionLabel: sectionLabel,
          marks: [practiceMark(roleValue)]
        });
        roleOrder.push(roleId);
        continue;
      }

      if (existing.roleName !== roleName) {
        invalidRoleIds.add(roleId);
      }
      existing.marks.push(practiceMark(roleValue));
    }
  }

  for (const roleId of roleOrder) {
    if (invalidRoleIds.has(roleId) || (activeRole && roleId !== activeRole)) {
      continue;
    }
    const evidence = evidenceByRole.get(roleId);
    if (!evidence || !isConsistentlyUnlogged(evidence.marks)) {
      continue;
    }
    return {
      sectionLabel: evidence.firstSectionLabel,
      roleName: evidence.roleName
    };
  }

  return null;
}

/** Fill trusted `{token}` placeholders for unlogged-practice copy. */
export function fillUnloggedPracticeCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
