/** Renderer-visible source kinds backed by the current native playback authority. */
export type PlaybackSourceKind =
  | "full_mix"
  | "vocals"
  | "bass"
  | "drums"
  | "other";

/** One opaque, project-scoped source that the rehearsal player may select. */
export interface PlaybackSourceOption {
  kind: PlaybackSourceKind;
  authority: string;
}

const FULL_MIX_AUTHORITY = /^bandscope-project:\/\/(project-[0-9]+-[0-9]+)$/;
const SOURCE_AUTHORITY =
  /^bandscope-project:\/\/(project-[0-9]+-[0-9]+)(?:\/stem\/(vocals|bass|drums|other))?$/;
const STEM_ORDER = ["vocals", "bass", "drums", "other"] as const;

/**
 * Project native availability into renderer options without creating authority.
 * A generated set is all-or-nothing because native admission binds four stems atomically.
 */
export function derivePlaybackSourceOptions(
  currentFullMixAuthority: string | null | undefined,
  availableAuthorities: unknown,
): PlaybackSourceOption[] | null {
  if (typeof currentFullMixAuthority !== "string") {
    return null;
  }
  const currentMatch = currentFullMixAuthority.match(FULL_MIX_AUTHORITY);
  if (!currentMatch || !Array.isArray(availableAuthorities)) {
    return null;
  }

  const projectId = currentMatch[1];
  const seen = new Set<string>();
  let hasFullMix = false;
  const stems = new Map<(typeof STEM_ORDER)[number], string>();

  for (const candidate of availableAuthorities) {
    if (typeof candidate !== "string" || seen.has(candidate)) {
      return null;
    }
    seen.add(candidate);

    const match = candidate.match(SOURCE_AUTHORITY);
    if (!match || match[1] !== projectId) {
      return null;
    }

    const stemKind = match[2] as (typeof STEM_ORDER)[number] | undefined;
    if (stemKind === undefined) {
      if (candidate !== currentFullMixAuthority || hasFullMix) {
        return null;
      }
      hasFullMix = true;
      continue;
    }

    if (stems.has(stemKind)) {
      return null;
    }
    stems.set(stemKind, candidate);
  }

  if (!hasFullMix) {
    return null;
  }

  if (stems.size === 0) {
    return [{ kind: "full_mix", authority: currentFullMixAuthority }];
  }

  if (
    stems.size !== STEM_ORDER.length ||
    STEM_ORDER.some((stemKind) => !stems.has(stemKind))
  ) {
    return null;
  }

  const stemOptions: PlaybackSourceOption[] = [];
  for (const stemKind of STEM_ORDER) {
    const authority = stems.get(stemKind);
    if (authority === undefined) {
      return null;
    }
    stemOptions.push({ kind: stemKind, authority });
  }

  return [
    { kind: "full_mix", authority: currentFullMixAuthority },
    ...stemOptions,
  ];
}
