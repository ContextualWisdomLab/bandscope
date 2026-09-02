import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

/** Trustworthy state of tonight's first unlogged-practice decision. */
export type FirstUnloggedPractice =
  | {
      kind: "unlogged";
      sectionLabel: string;
      roleName: string;
    }
  | { kind: "selected-logged" }
  | { kind: "all-logged" }
  | { kind: "unavailable" };

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

/** Return whether every section copy owns the same trustworthy practice mark. */
function isConsistentlyLogged(marks: PracticeMark[]): boolean {
  if (marks.length === 0 || marks.some((mark) => mark.kind !== "logged")) {
    return false;
  }
  const expected = (marks[0] as Extract<PracticeMark, { kind: "logged" }>).value;
  return marks.every(
    (mark) => mark.kind === "logged" && mark.value === expected
  );
}

/**
 * Resolve tonight's first trustworthy unlogged-practice state.
 *
 * The same role id may legitimately appear in several song sections. Those
 * copies are one rehearsal part only when their display name agrees and their
 * practice evidence is role-wide consistent. Duplicate ids inside one
 * section, conflicting names, mixed logged/unlogged copies, malformed marks,
 * inherited identity, or malformed collection evidence never become proof
 * that a part—or the whole rehearsal—has already been logged.
 */
export function firstUnloggedPractice(
  song: RehearsalSong,
  activeRole: string | null = null
): FirstUnloggedPractice {
  const runtimeSong: unknown = song;
  if (!isRuntimeObject(runtimeSong) || !owns(runtimeSong, "sections") || !Array.isArray(runtimeSong.sections)) {
    return { kind: "unavailable" };
  }

  const evidenceByRole = new Map<string, RoleEvidence>();
  const roleOrder: string[] = [];
  const invalidRoleIds = new Set<string>();
  let hasInvalidEvidence = false;

  for (const sectionValue of runtimeSong.sections) {
    if (
      !isRuntimeObject(sectionValue) ||
      !owns(sectionValue, "label") ||
      !owns(sectionValue, "roles") ||
      !Array.isArray(sectionValue.roles)
    ) {
      return { kind: "unavailable" };
    }

    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (!sectionLabel) {
      return { kind: "unavailable" };
    }

    const sectionRoleIds = new Set<string>();
    for (const roleValue of sectionValue.roles) {
      if (
        !isRuntimeObject(roleValue) ||
        !owns(roleValue, "id") ||
        !owns(roleValue, "name")
      ) {
        hasInvalidEvidence = true;
        continue;
      }

      const roleId = meaningfulRangeText(roleValue.id);
      const roleName = meaningfulRangeText(roleValue.name);
      if (!roleId || !roleName) {
        hasInvalidEvidence = true;
        continue;
      }

      if (sectionRoleIds.has(roleId)) {
        invalidRoleIds.add(roleId);
        hasInvalidEvidence = true;
        continue;
      }
      sectionRoleIds.add(roleId);

      const mark = practiceMark(roleValue);
      if (mark.kind === "invalid") {
        hasInvalidEvidence = true;
      }

      const existing = evidenceByRole.get(roleId);
      if (!existing) {
        evidenceByRole.set(roleId, {
          roleName,
          firstSectionLabel: sectionLabel,
          marks: [mark]
        });
        roleOrder.push(roleId);
        continue;
      }

      if (existing.roleName !== roleName) {
        invalidRoleIds.add(roleId);
        hasInvalidEvidence = true;
      }
      existing.marks.push(mark);
    }
  }

  if (activeRole) {
    const evidence = evidenceByRole.get(activeRole);
    if (!evidence || invalidRoleIds.has(activeRole)) {
      return { kind: "unavailable" };
    }
    if (isConsistentlyUnlogged(evidence.marks)) {
      return {
        kind: "unlogged",
        sectionLabel: evidence.firstSectionLabel,
        roleName: evidence.roleName
      };
    }
    if (isConsistentlyLogged(evidence.marks)) {
      return { kind: "selected-logged" };
    }
    return { kind: "unavailable" };
  }

  for (const roleId of roleOrder) {
    if (invalidRoleIds.has(roleId)) {
      continue;
    }
    const evidence = evidenceByRole.get(roleId);
    if (!evidence) {
      hasInvalidEvidence = true;
      continue;
    }
    if (isConsistentlyUnlogged(evidence.marks)) {
      return {
        kind: "unlogged",
        sectionLabel: evidence.firstSectionLabel,
        roleName: evidence.roleName
      };
    }
    if (!isConsistentlyLogged(evidence.marks)) {
      hasInvalidEvidence = true;
    }
  }

  if (roleOrder.length === 0 || invalidRoleIds.size > 0 || hasInvalidEvidence) {
    return { kind: "unavailable" };
  }
  return { kind: "all-logged" };
}

/** Fill trusted `{token}` placeholders for unlogged-practice copy. */
export function fillUnloggedPracticeCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
