/** Closed first-run role choices that map onto admitted analysis role IDs. */

export const FIRST_RUN_WHOLE_BAND_ROLE_FOCUS = [
  "bass-guitar",
  "keys-right",
  "lead-vocal"
] as const;

export const FIRST_RUN_ROLE_OPTIONS = [
  { id: "whole-band", roleFocus: FIRST_RUN_WHOLE_BAND_ROLE_FOCUS },
  { id: "lead-vocal", roleFocus: ["lead-vocal"] },
  { id: "bass-guitar", roleFocus: ["bass-guitar"] },
  { id: "keys-right", roleFocus: ["keys-right"] }
] as const;

export type FirstRunRoleId = (typeof FIRST_RUN_ROLE_OPTIONS)[number]["id"];

const FIRST_RUN_ROLE_IDS: ReadonlySet<string> = new Set(
  FIRST_RUN_ROLE_OPTIONS.map((option) => option.id)
);

/** Return whether the value is an admitted first-run role choice. */
export function isFirstRunRoleId(value: string): value is FirstRunRoleId {
  return FIRST_RUN_ROLE_IDS.has(value);
}

/** Resolve the analysis roleFocus for an admitted first-run choice. */
export function roleFocusForFirstRun(roleId: FirstRunRoleId): string[] {
  const option = FIRST_RUN_ROLE_OPTIONS.find((entry) => entry.id === roleId);
  return option ? [...option.roleFocus] : [...FIRST_RUN_WHOLE_BAND_ROLE_FOCUS];
}

/** Keep only a basename so first-run copy never renders a local path. */
export function displaySelectedAudioName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return "";
  }

  const segments = trimmed.split(/[\\/]+/u).filter((segment) => segment.length > 0);
  const base = segments.at(-1) ?? "";
  if (!base || base === "." || base === "..") {
    return "";
  }

  return base.replaceAll("\0", "").slice(0, 255);
}
