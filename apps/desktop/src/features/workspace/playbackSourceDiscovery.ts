import {
  derivePlaybackSourceOptions,
  type PlaybackSourceOption,
} from "./playbackSourceSelection";

/** Minimal invoke boundary used to discover renderer-safe native playback sources. */
export type PlaybackSourceInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

/**
 * Discover the currently registered playback sources without creating authority.
 *
 * The caller must already own the current opaque full-mix authority. Native IPC
 * may only return opaque authorities; every response is revalidated by the
 * renderer projector before it can become a buyer-visible source option.
 */
export async function discoverPlaybackSourceOptions(
  currentFullMixAuthority: string | null | undefined,
  invokeCommand: PlaybackSourceInvoke,
): Promise<PlaybackSourceOption[] | null> {
  if (
    derivePlaybackSourceOptions(currentFullMixAuthority, [currentFullMixAuthority]) ===
    null
  ) {
    return null;
  }

  try {
    const availableAuthorities = await invokeCommand(
      "get_playback_source_availability",
      { currentFullMixAuthority },
    );
    return derivePlaybackSourceOptions(
      currentFullMixAuthority,
      availableAuthorities,
    );
  } catch {
    return null;
  }
}
