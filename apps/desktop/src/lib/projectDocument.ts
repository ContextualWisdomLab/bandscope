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
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key)) && Object.keys(value).length === allowedKeys.length;
}

/**
 * Validate the renderer-visible project document without accepting filesystem paths,
 * runtime capability URLs, generation tokens, prototype-bearing records, or unknown preference fields.
 */
export function parseProjectDocument(value: unknown): ProjectDocument {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["song", "preferences"])) {
    throw new Error("Invalid project document");
  }

  const preferences = value.preferences;
  if (!isPlainRecord(preferences) || !hasOnlyKeys(preferences, ["selectedPlaybackSource"])) {
    throw new Error("Invalid project document");
  }

  const selectedPlaybackSource = preferences.selectedPlaybackSource;
  if (
    typeof selectedPlaybackSource !== "string" ||
    !SELECTED_PLAYBACK_SOURCES.has(selectedPlaybackSource as SelectedPlaybackSource)
  ) {
    throw new Error("Invalid project document");
  }

  return {
    song: parseRehearsalSong(value.song),
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
