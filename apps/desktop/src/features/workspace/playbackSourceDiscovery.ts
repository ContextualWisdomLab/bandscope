import {
  derivePlaybackSourceOptions,
  type PlaybackSourceOption,
} from "./playbackSourceSelection";

/** Minimal invoke boundary used to discover renderer-safe native playback sources. */
export type PlaybackSourceInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

/** Buyer-relevant result of one native source-availability lookup. */
export type PlaybackSourceDiscoveryOutcome =
  | { status: "ready"; options: PlaybackSourceOption[] }
  | { status: "empty"; options: PlaybackSourceOption[] }
  | { status: "error"; options: null };

/**
 * Discover the currently registered playback sources and preserve the reason a
 * selector is absent without exposing native error details to the renderer.
 */
export async function discoverPlaybackSourceOutcome(
  currentFullMixAuthority: string | null | undefined,
  invokeCommand: PlaybackSourceInvoke,
): Promise<PlaybackSourceDiscoveryOutcome> {
  if (
    derivePlaybackSourceOptions(currentFullMixAuthority, [currentFullMixAuthority]) ===
    null
  ) {
    return { status: "error", options: null };
  }

  try {
    const availableAuthorities = await invokeCommand(
      "get_playback_source_availability",
      { currentFullMixAuthority },
    );
    const options = derivePlaybackSourceOptions(
      currentFullMixAuthority,
      availableAuthorities,
    );
    if (options === null) {
      return { status: "error", options: null };
    }
    return options.length > 1
      ? { status: "ready", options }
      : { status: "empty", options };
  } catch {
    return { status: "error", options: null };
  }
}

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
  return (
    await discoverPlaybackSourceOutcome(currentFullMixAuthority, invokeCommand)
  ).options;
}
