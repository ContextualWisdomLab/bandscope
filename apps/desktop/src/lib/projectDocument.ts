import { parseRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";

/** Stable project preference persisted across sessions; never a runtime playback authority. */
export type SelectedPlaybackSource = "full_mix" | "vocals" | "bass" | "drums" | "other";

/** Durable Project Persistence preferences owned by the versioned `.bscope` document. */
export type ProjectPreferences = {
  selectedPlaybackSource: SelectedPlaybackSource;
};

/** Current renderer-facing project document admitted by the native persistence owner. */
export type ProjectDocument = {
  song: RehearsalSong;
  preferences: ProjectPreferences;
};

const SELECTED_PLAYBACK_SOURCES = new Set<SelectedPlaybackSource>([
  "full_mix",
  "vocals",
  "bass",
  "drums",
  "other"
]);

type OwnDataProperty =
  | { ok: true; value: unknown }
  | { ok: false };

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

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  try {
    const keys = Object.keys(value);
    return keys.length === allowedKeys.length && keys.every((key) => allowedKeys.includes(key));
  } catch {
    return false;
  }
}

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

/**
 * Validate the renderer-visible project document without accepting filesystem paths,
 * runtime capability URLs, generation tokens, prototype-bearing records, accessors,
 * trapped record enumeration, or unknown preference fields.
 */
export function parseProjectDocument(value: unknown): ProjectDocument {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["song", "preferences"])) {
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

  return {
    song: parseRehearsalSong(songProperty.value),
    preferences: {
      selectedPlaybackSource: selectedPlaybackSource as SelectedPlaybackSource
    }
  };
}

/** Build the exact current renderer document before crossing the native persistence boundary. */
export function createProjectDocument(
  song: RehearsalSong,
  selectedPlaybackSource: SelectedPlaybackSource = "full_mix"
): ProjectDocument {
  return parseProjectDocument({
    song: parseRehearsalSong(song),
    preferences: { selectedPlaybackSource }
  });
}
