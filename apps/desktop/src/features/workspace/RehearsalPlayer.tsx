import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
  type SyntheticEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RehearsalPlayer as RehearsalPlayerCore,
} from "./RehearsalPlayerCore";
import { discoverPlaybackSourceOptions, type PlaybackSourceInvoke } from "./playbackSourceDiscovery";
import {
  beginPlaybackSourceDiscovery,
  completePlaybackSourceDiscovery,
  createPlaybackSourceSession,
  selectPlaybackSource,
  type PlaybackSourceSession,
} from "./playbackSourceSession";
import type { PlaybackSourceKind } from "./playbackSourceSelection";

export { isPlayableAudioSource } from "./RehearsalPlayerCore";

type RehearsalPlayerCoreProps = ComponentProps<typeof RehearsalPlayerCore>;

export type RehearsalPlayerProps = RehearsalPlayerCoreProps & {
  /** Test seam for the renderer-safe Tauri availability command. */
  playbackSourceInvoke?: PlaybackSourceInvoke;
};

const PLAYBACK_SOURCE_LABEL: Readonly<Record<PlaybackSourceKind, string>> = {
  full_mix: "Full mix",
  vocals: "Vocals",
  bass: "Bass",
  drums: "Drums",
  other: "Other instruments",
};

function commitPlaybackSourceSession(
  sessionRef: { current: PlaybackSourceSession },
  setSession: (next: PlaybackSourceSession) => void,
  next: PlaybackSourceSession,
): void {
  sessionRef.current = next;
  setSession(next);
}

/**
 * Bind renderer-safe source discovery to the mounted rehearsal player.
 *
 * This wrapper owns only option discovery/selection. The existing player remains
 * the transport owner and receives exactly one opaque current source authority.
 */
export function RehearsalPlayer({
  playbackSourceInvoke,
  audioSourcePath = null,
  hasLocalAudio = false,
  ...coreProps
}: RehearsalPlayerProps): ReactElement {
  const sourceGroupName = useId();
  const invokePlaybackSource = useMemo<PlaybackSourceInvoke>(
    () =>
      playbackSourceInvoke ??
      ((command, args) => invoke(command, args)),
    [playbackSourceInvoke],
  );
  const [sourceSession, setSourceSession] = useState<PlaybackSourceSession>(() =>
    createPlaybackSourceSession(hasLocalAudio ? audioSourcePath : null),
  );
  const sourceSessionRef = useRef(sourceSession);
  const discoveryGenerationRef = useRef(0);

  const discoverCurrentPlaybackSources = useCallback(
    (
      baseSession: PlaybackSourceSession,
      currentFullMixAuthority: string | null,
    ): void => {
      const generation = ++discoveryGenerationRef.current;
      const started = beginPlaybackSourceDiscovery(
        baseSession,
        currentFullMixAuthority,
      );
      commitPlaybackSourceSession(
        sourceSessionRef,
        setSourceSession,
        started.state,
      );
      if (started.request === null) {
        return;
      }

      const request = started.request;
      void discoverPlaybackSourceOptions(
        request.fullMixAuthority,
        invokePlaybackSource,
      ).then((discovered) => {
        if (generation !== discoveryGenerationRef.current) {
          return;
        }
        const completed = completePlaybackSourceDiscovery(
          sourceSessionRef.current,
          request,
          discovered,
        );
        commitPlaybackSourceSession(
          sourceSessionRef,
          setSourceSession,
          completed,
        );
      });
    },
    [invokePlaybackSource],
  );

  useEffect(() => {
    const currentFullMixAuthority = hasLocalAudio ? audioSourcePath : null;
    discoverCurrentPlaybackSources(
      createPlaybackSourceSession(currentFullMixAuthority),
      currentFullMixAuthority,
    );
    return () => {
      discoveryGenerationRef.current += 1;
    };
  }, [audioSourcePath, discoverCurrentPlaybackSources, hasLocalAudio]);

  const choosePlaybackSource = useCallback((authority: string) => {
    const selected = selectPlaybackSource(sourceSessionRef.current, authority);
    commitPlaybackSourceSession(sourceSessionRef, setSourceSession, selected);
  }, []);

  const handlePlaybackSourceErrorCapture = useCallback(
    (event: SyntheticEvent<HTMLDivElement>): void => {
      if (!(event.target instanceof HTMLMediaElement)) {
        return;
      }
      const current = sourceSessionRef.current;
      if (
        current.fullMixAuthority === null ||
        current.fullMixAuthority !== audioSourcePath ||
        current.selectedAuthority === null ||
        current.selectedAuthority === current.fullMixAuthority
      ) {
        return;
      }

      // Native stem authority is revocable. Drop the failed stem before awaiting IPC.
      discoverCurrentPlaybackSources(current, current.fullMixAuthority);
    },
    [audioSourcePath, discoverCurrentPlaybackSources],
  );

  const sessionMatchesMountedProject =
    hasLocalAudio && sourceSession.fullMixAuthority === audioSourcePath;
  const visibleOptions = sessionMatchesMountedProject
    ? sourceSession.options
    : [];
  const selectedAuthority = sessionMatchesMountedProject
    ? sourceSession.selectedAuthority ?? audioSourcePath
    : hasLocalAudio
      ? audioSourcePath
      : null;
  const hasStemChoices = visibleOptions.length > 1;
  // A new full-mix authority is a new project/generation boundary; it must not
  // inherit transport phase or a renderer-local source-switch receipt.
  const mountedProjectKey = hasLocalAudio
    ? audioSourcePath ?? "local-audio-without-authority"
    : "no-local-audio";

  return (
    <div className="contents" onErrorCapture={handlePlaybackSourceErrorCapture}>
      {hasStemChoices ? (
        <fieldset className="mb-3 border-b border-white/10 pb-3">
          <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
            Playback source
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {visibleOptions.map((option) => (
              <label
                key={option.authority}
                className="flex min-h-11 cursor-pointer items-center gap-2 px-2 text-sm font-semibold text-slate-100 focus-within:outline-none focus-within:ring-2 focus-within:ring-cyan-300"
              >
                <input
                  checked={sourceSession.selectedAuthority === option.authority}
                  className="h-5 w-5 accent-cyan-300"
                  name={sourceGroupName}
                  onChange={() => choosePlaybackSource(option.authority)}
                  type="radio"
                  value={option.authority}
                />
                <span>{PLAYBACK_SOURCE_LABEL[option.kind]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <RehearsalPlayerCore
        key={mountedProjectKey}
        {...coreProps}
        hasLocalAudio={hasLocalAudio}
        audioSourcePath={selectedAuthority}
      />
    </div>
  );
}
