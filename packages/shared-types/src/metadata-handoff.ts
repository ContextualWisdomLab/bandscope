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

function invalidField(path: string): Error {
  return new Error(`Invalid rehearsal song contract: invalid field '${path}'`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSectionFormLabel(value: unknown): value is SectionFormLabel {
  return typeof value === "string" && (SECTION_FORM_LABELS as readonly string[]).includes(value);
}

function validateFirstAction(value: unknown): void {
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

  validateFirstAction(value.firstAction);
  const { firstAction: _firstAction, ...legacyFields } = value;
  parseLegacyMetadataHandoffArtifact({
    ...legacyFields,
    artifactVersion: 1
  });

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
