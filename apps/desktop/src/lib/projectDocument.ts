import { parseRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";

/** Stable project preference persisted across sessions; never a runtime playback authority. */
export type SelectedPlaybackSource = "full_mix" | "vocals" | "bass" | "drums" | "other";

/** Durable Project Persistence preferences owned by the versioned `.bscope` document. */
export type ProjectPreferences = {
  selectedPlaybackSource: SelectedPlaybackSource;
};

/** App-owned audio artifact identity used for process-restart re-admission. */
export type ProjectSourceReference = {
  projectId: string;
  artifactName: string;
  extension: "wav" | "mp3" | "flac" | "m4a";
  fileSizeBytes: number;
  contentSha256: string;
};

/** Current renderer-facing project document admitted by the native persistence owner. */
export type ProjectDocument = {
  song: RehearsalSong;
  preferences: ProjectPreferences;
  sourceReference?: ProjectSourceReference;
};

const SELECTED_PLAYBACK_SOURCES = new Set<SelectedPlaybackSource>([
  "full_mix",
  "vocals",
  "bass",
  "drums",
  "other"
]);
const PROJECT_SOURCE_EXTENSIONS = new Set<ProjectSourceReference["extension"]>([
  "wav",
  "mp3",
  "flac",
  "m4a"
]);
const PROJECT_ID_PATTERN = /^project-\d+-\d+$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

type OwnDataProperty =
  | { ok: true; value: unknown }
  | { ok: false };
type OptionalOwnDataProperty =
  | { ok: true; present: false }
  | { ok: true; present: true; value: unknown }
  | { ok: false; present: false };

/** Accept only passive JSON-style records; prototype inspection traps fail closed. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

/** Confirm a record exposes exactly the allowed enumerable own keys; enumeration traps fail closed. */
function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  try {
    const keys = Object.keys(value);
    return keys.length === allowedKeys.length && keys.every((key) => allowedKeys.includes(key));
  } catch {
    return false;
  }
}

/** Confirm required keys exist and every enumerable own key belongs to the declared project schema. */
function hasRequiredAndOptionalKeys(
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[]
): boolean {
  try {
    const keys = Object.keys(value);
    return (
      requiredKeys.every((key) => keys.includes(key)) &&
      keys.every((key) => requiredKeys.includes(key) || optionalKeys.includes(key))
    );
  } catch {
    return false;
  }
}

/** Read an enumerable own data property without invoking accessors; descriptor traps fail closed. */
function ownEnumerableDataProperty(value: Record<string, unknown>, key: string): OwnDataProperty {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      return { ok: false };
    }
    return { ok: true, value: descriptor.value };
  } catch {
    return { ok: false };
  }
}

/** Read an optional enumerable own data property without invoking accessors; descriptor traps fail closed. */
function optionalOwnEnumerableDataProperty(
  value: Record<string, unknown>,
  key: string
): OptionalOwnDataProperty {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) {
      return { ok: true, present: false };
    }
    if (!descriptor.enumerable || !("value" in descriptor)) {
      return { ok: false, present: false };
    }
    return { ok: true, present: true, value: descriptor.value };
  } catch {
    return { ok: false, present: false };
  }
}

/** Validate path-free app-owned audio identity before admitting it as durable project truth. */
function parseProjectSourceReference(value: unknown): ProjectSourceReference {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, ["projectId", "artifactName", "extension", "fileSizeBytes", "contentSha256"])
  ) {
    throw new Error("Invalid project document");
  }

  const projectIdProperty = ownEnumerableDataProperty(value, "projectId");
  const artifactNameProperty = ownEnumerableDataProperty(value, "artifactName");
  const extensionProperty = ownEnumerableDataProperty(value, "extension");
  const fileSizeBytesProperty = ownEnumerableDataProperty(value, "fileSizeBytes");
  const contentSha256Property = ownEnumerableDataProperty(value, "contentSha256");
  if (
    !projectIdProperty.ok ||
    !artifactNameProperty.ok ||
    !extensionProperty.ok ||
    !fileSizeBytesProperty.ok ||
    !contentSha256Property.ok
  ) {
    throw new Error("Invalid project document");
  }

  const projectId = projectIdProperty.value;
  const artifactName = artifactNameProperty.value;
  const extension = extensionProperty.value;
  const fileSizeBytes = fileSizeBytesProperty.value;
  const contentSha256 = contentSha256Property.value;
  if (
    typeof projectId !== "string" ||
    !PROJECT_ID_PATTERN.test(projectId) ||
    typeof extension !== "string" ||
    !PROJECT_SOURCE_EXTENSIONS.has(extension as ProjectSourceReference["extension"]) ||
    typeof artifactName !== "string" ||
    artifactName !== `source.${extension}` ||
    typeof fileSizeBytes !== "number" ||
    !Number.isSafeInteger(fileSizeBytes) ||
    fileSizeBytes <= 0 ||
    typeof contentSha256 !== "string" ||
    !SHA256_HEX_PATTERN.test(contentSha256)
  ) {
    throw new Error("Invalid project document");
  }

  return {
    projectId,
    artifactName,
    extension: extension as ProjectSourceReference["extension"],
    fileSizeBytes,
    contentSha256
  };
}

/**
 * Validate the renderer-visible project document without accepting filesystem paths,
 * runtime capability URLs, generation tokens, prototype-bearing records, accessors,
 * trapped record enumeration, ambiguous source digests, or unknown preference/source-reference fields.
 */
export function parseProjectDocument(value: unknown): ProjectDocument {
  if (
    !isPlainRecord(value) ||
    !hasRequiredAndOptionalKeys(value, ["song", "preferences"], ["sourceReference"])
  ) {
    throw new Error("Invalid project document");
  }

  const songProperty = ownEnumerableDataProperty(value, "song");
  const preferencesProperty = ownEnumerableDataProperty(value, "preferences");
  if (!songProperty.ok || !preferencesProperty.ok || !isPlainRecord(preferencesProperty.value)) {
    throw new Error("Invalid project document");
  }

  const preferences = preferencesProperty.value;
  if (!hasOnlyKeys(preferences, ["selectedPlaybackSource"])) {
    throw new Error("Invalid project document");
  }

  const selectedPlaybackSourceProperty = ownEnumerableDataProperty(preferences, "selectedPlaybackSource");
  if (!selectedPlaybackSourceProperty.ok) {
    throw new Error("Invalid project document");
  }
  const selectedPlaybackSource = selectedPlaybackSourceProperty.value;
  if (
    typeof selectedPlaybackSource !== "string" ||
    !SELECTED_PLAYBACK_SOURCES.has(selectedPlaybackSource as SelectedPlaybackSource)
  ) {
    throw new Error("Invalid project document");
  }

  const sourceReferenceProperty = optionalOwnEnumerableDataProperty(value, "sourceReference");
  if (!sourceReferenceProperty.ok) {
    throw new Error("Invalid project document");
  }
  const sourceReference = sourceReferenceProperty.present
    ? parseProjectSourceReference(sourceReferenceProperty.value)
    : undefined;

  return {
    song: parseRehearsalSong(songProperty.value),
    preferences: {
      selectedPlaybackSource: selectedPlaybackSource as SelectedPlaybackSource
    },
    ...(sourceReference ? { sourceReference } : {})
  };
}

/** Build the exact current renderer document before crossing the native persistence boundary. */
export function createProjectDocument(
  song: RehearsalSong,
  selectedPlaybackSource: SelectedPlaybackSource = "full_mix",
  sourceReference?: ProjectSourceReference
): ProjectDocument {
  return parseProjectDocument({
    song: parseRehearsalSong(song),
    preferences: { selectedPlaybackSource },
    ...(sourceReference ? { sourceReference } : {})
  });
}
