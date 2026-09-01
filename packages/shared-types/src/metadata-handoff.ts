import {
  SECTION_FORM_LABELS,
  parseMetadataHandoffArtifact as parseLegacyMetadataHandoffArtifact,
  type MetadataHandoffArtifact as LegacyMetadataHandoffArtifact,
  type SectionFormLabel
} from "./legacy-index";

/** The original metadata handoff contract accepted by existing v1 readers. */
export type MetadataHandoffArtifactV1 = LegacyMetadataHandoffArtifact;

/** Tonight's first concrete instrument check carried by a v2 handoff. */
export type MetadataHandoffFirstAction = {
  sectionId: string;
  sectionLabel: SectionFormLabel;
  roleId: string;
  roleName: string;
  lowestNote: string;
  highestNote: string;
  clash: boolean;
};

/** Metadata handoff v2 adds one required first action without changing the v1 schema. */
export type MetadataHandoffArtifactV2 = Omit<MetadataHandoffArtifactV1, "artifactVersion"> & {
  artifactVersion: 2;
  firstAction: MetadataHandoffFirstAction;
};

/** A metadata handoff accepted by this BandScope version. */
export type MetadataHandoffArtifact = MetadataHandoffArtifactV1 | MetadataHandoffArtifactV2;

const NATURAL_PITCH_CLASS = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
} as const;

const ACCIDENTAL_OFFSET: Record<string, number> = {
  "": 0,
  "#": 1,
  "♯": 1,
  b: -1,
  "♭": -1
};

const NOTE_PATTERN = /^([A-Ga-g])([#b♯♭]?)(-?\d{1,2})$/u;

/** Build the stable public validation error for one metadata-handoff field. */
function invalidField(path: string): Error {
  return new Error(`Invalid rehearsal song contract: invalid field '${path}'`);
}

/** Return whether a runtime value is a non-array object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return whether a runtime value is an admitted section-form label. */
function isSectionFormLabel(value: unknown): value is SectionFormLabel {
  return typeof value === "string" && (SECTION_FORM_LABELS as readonly string[]).includes(value);
}

/** Convert a supported scientific-pitch label into chromatic ordering. */
function notePitchValue(note: string): number | null {
  const match = NOTE_PATTERN.exec(note.trim());
  if (!match) {
    return null;
  }

  const letter = match[1].toUpperCase() as keyof typeof NATURAL_PITCH_CLASS;
  const octave = Number(match[3]);
  return (octave + 1) * 12 + NATURAL_PITCH_CLASS[letter] + ACCIDENTAL_OFFSET[match[2]];
}

/** Shape-check the v2 lead and verify its playable span before it becomes authority. */
function validateFirstAction(value: unknown): MetadataHandoffFirstAction {
  if (!isRecord(value)) {
    throw invalidField("firstAction");
  }

  const allowedKeys = [
    "sectionId",
    "sectionLabel",
    "roleId",
    "roleName",
    "lowestNote",
    "highestNote",
    "clash"
  ] as const;
  for (const key of Object.keys(value)) {
    if (!(allowedKeys as readonly string[]).includes(key)) {
      throw invalidField(`firstAction.${key}`);
    }
  }

  for (const key of ["sectionId", "roleId", "roleName", "lowestNote", "highestNote"] as const) {
    const field = value[key];
    if (typeof field !== "string" || field.trim().length === 0) {
      throw invalidField(`firstAction.${key}`);
    }
  }
  if (!isSectionFormLabel(value.sectionLabel)) {
    throw invalidField("firstAction.sectionLabel");
  }
  if (typeof value.clash !== "boolean") {
    throw invalidField("firstAction.clash");
  }

  const lowestPitch = notePitchValue(value.lowestNote as string);
  if (lowestPitch === null) {
    throw invalidField("firstAction.lowestNote");
  }
  const highestPitch = notePitchValue(value.highestNote as string);
  if (highestPitch === null || lowestPitch > highestPitch) {
    throw invalidField("firstAction.highestNote");
  }

  return value as MetadataHandoffFirstAction;
}

/** Require the v2 lead to point at exactly one exported section and role bucket. */
function validateFirstActionReferences(
  firstAction: MetadataHandoffFirstAction,
  artifact: MetadataHandoffArtifactV1
): void {
  const matchingSections = artifact.sections.filter((section) => section.id === firstAction.sectionId);
  if (matchingSections.length !== 1) {
    throw invalidField("firstAction.sectionId");
  }

  const section = matchingSections[0]!;
  if (section.label !== firstAction.sectionLabel) {
    throw invalidField("firstAction.sectionLabel");
  }

  const matchingRoles = section.roleBuckets.filter((role) => role.id === firstAction.roleId);
  if (matchingRoles.length !== 1) {
    throw invalidField("firstAction.roleId");
  }
  if (matchingRoles[0]!.name !== firstAction.roleName) {
    throw invalidField("firstAction.roleName");
  }
}

/**
 * Parse both the immutable v1 handoff and the first-action v2 handoff.
 *
 * V1 is delegated unchanged to the original strict parser. V2 validates its
 * new field, then reuses that same v1 parser for every unchanged field so the
 * new version cannot silently weaken the established metadata boundary.
 */
export function parseMetadataHandoffArtifact(value: unknown): MetadataHandoffArtifact {
  if (!isRecord(value)) {
    return parseLegacyMetadataHandoffArtifact(value);
  }

  if (value.artifactVersion === 1) {
    return parseLegacyMetadataHandoffArtifact(value);
  }
  if (value.artifactVersion !== 2) {
    throw invalidField("artifactVersion");
  }
  if (!Object.prototype.hasOwnProperty.call(value, "firstAction")) {
    throw invalidField("firstAction");
  }

  const firstAction = validateFirstAction(value.firstAction);
  const legacyFields: Record<string, unknown> = { ...value };
  delete legacyFields.firstAction;
  const legacyArtifact = parseLegacyMetadataHandoffArtifact({
    ...legacyFields,
    artifactVersion: 1
  });
  validateFirstActionReferences(firstAction, legacyArtifact);

  return structuredClone(value as MetadataHandoffArtifactV2);
}

/** Return whether a runtime value is a valid metadata handoff version. */
export function isMetadataHandoffArtifact(value: unknown): value is MetadataHandoffArtifact {
  try {
    parseMetadataHandoffArtifact(value);
    return true;
  } catch {
    return false;
  }
}
