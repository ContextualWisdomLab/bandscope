import {
  isRehearsalPlaybackRate,
  type RehearsalPlaybackRate,
  type RehearsalTransportPhase,
  type RehearsalTransportState,
} from "./rehearsalTransport";

/** Transport continuity that must survive one admitted playback-source change. */
export interface PlaybackSourceSwitchPlan {
  loopStartSeconds: number;
  loopEndSeconds: number;
  seekSeconds: number;
  playbackRate: RehearsalPlaybackRate;
  sourcePhase: Extract<RehearsalTransportPhase, "armed" | "looping" | "paused">;
  resumeAfterLoad: boolean;
}

/**
 * Capture transport continuity before replacing the media source.
 *
 * Count-in changes are deliberately rejected: changing media while the independent
 * count-in clock is running would create a second timing race. Looping/paused
 * switches retain the exact admitted media position; armed switches start from the
 * selected loop boundary. Invalid positions fail closed rather than being clamped.
 */
export function capturePlaybackSourceSwitch(
  transport: RehearsalTransportState,
  currentMediaTimeSeconds: number,
): PlaybackSourceSwitchPlan | null {
  const loop = transport.loop;
  if (
    !loop ||
    !isRehearsalPlaybackRate(transport.playbackRate) ||
    (transport.phase !== "armed" &&
      transport.phase !== "looping" &&
      transport.phase !== "paused")
  ) {
    return null;
  }

  const seekSeconds =
    transport.phase === "armed" ? loop.startSeconds : currentMediaTimeSeconds;
  if (
    !Number.isFinite(seekSeconds) ||
    seekSeconds < loop.startSeconds ||
    seekSeconds >= loop.endSeconds
  ) {
    return null;
  }

  return {
    loopStartSeconds: loop.startSeconds,
    loopEndSeconds: loop.endSeconds,
    seekSeconds,
    playbackRate: transport.playbackRate,
    sourcePhase: transport.phase,
    resumeAfterLoad: transport.phase === "looping",
  };
}

/**
 * Admit the decoded target only when it can still cover the selected loop and
 * captured position. A shorter/malformed source must not silently change rehearsal
 * range semantics after the selector changes authority.
 */
export function admitPlaybackSourceSwitchTarget(
  plan: PlaybackSourceSwitchPlan | null,
  targetDurationSeconds: number,
): PlaybackSourceSwitchPlan | null {
  if (
    !plan ||
    !Number.isFinite(targetDurationSeconds) ||
    targetDurationSeconds <= 0 ||
    plan.seekSeconds >= targetDurationSeconds ||
    plan.loopEndSeconds > targetDurationSeconds
  ) {
    return null;
  }
  return plan;
}
