import {
  isRehearsalPlaybackRate,
  type RehearsalPlaybackRate,
  type RehearsalTransportPhase,
  type RehearsalTransportState,
} from "./rehearsalTransport";

/** Identity of one renderer-owned media-source replacement attempt. */
export interface PlaybackSourceSwitchIdentity {
  sourceAuthority: string;
  targetAuthority: string;
  sequence: number;
}

/** Transport continuity that must survive one admitted playback-source change. */
export interface PlaybackSourceSwitchPlan extends PlaybackSourceSwitchIdentity {
  loopStartSeconds: number;
  loopEndSeconds: number;
  seekSeconds: number;
  playbackRate: RehearsalPlaybackRate;
  sourcePhase: Extract<RehearsalTransportPhase, "armed" | "looping" | "paused">;
  resumeAfterLoad: boolean;
}

function hasValidSwitchIdentity(identity: PlaybackSourceSwitchIdentity): boolean {
  return (
    typeof identity.sourceAuthority === "string" &&
    identity.sourceAuthority.length > 0 &&
    typeof identity.targetAuthority === "string" &&
    identity.targetAuthority.length > 0 &&
    identity.sourceAuthority !== identity.targetAuthority &&
    Number.isSafeInteger(identity.sequence) &&
    identity.sequence > 0
  );
}

/**
 * Capture transport continuity before replacing the media source.
 *
 * Count-in changes are deliberately rejected: changing media while the independent
 * count-in clock is running would create a second timing race. Looping/paused
 * switches retain the exact admitted media position; armed switches start from the
 * selected loop boundary. Invalid positions or switch identities fail closed rather
 * than being clamped or converted into an ambiguous no-op.
 */
export function capturePlaybackSourceSwitch(
  transport: RehearsalTransportState,
  currentMediaTimeSeconds: number,
  identity: PlaybackSourceSwitchIdentity,
): PlaybackSourceSwitchPlan | null {
  const loop = transport.loop;
  if (
    !loop ||
    !isRehearsalPlaybackRate(transport.playbackRate) ||
    !hasValidSwitchIdentity(identity) ||
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
    ...identity,
    loopStartSeconds: loop.startSeconds,
    loopEndSeconds: loop.endSeconds,
    seekSeconds,
    playbackRate: transport.playbackRate,
    sourcePhase: transport.phase,
    resumeAfterLoad: transport.phase === "looping",
  };
}

/**
 * Admit the decoded target only when it still belongs to the active switch receipt
 * and can cover the selected loop and captured position.
 *
 * `loadedmetadata` belongs to a mutable media element rather than to the source that
 * initiated the event. Matching both the target authority and monotonic renderer
 * sequence prevents a late receipt from an older load from restoring stale transport
 * state after a newer source selection has already superseded it.
 */
export function admitPlaybackSourceSwitchTarget(
  plan: PlaybackSourceSwitchPlan | null,
  targetDurationSeconds: number,
  currentTargetAuthority: string,
  currentSequence: number,
): PlaybackSourceSwitchPlan | null {
  if (
    !plan ||
    !Number.isFinite(targetDurationSeconds) ||
    targetDurationSeconds <= 0 ||
    plan.targetAuthority !== currentTargetAuthority ||
    plan.sequence !== currentSequence ||
    !Number.isSafeInteger(currentSequence) ||
    currentSequence <= 0 ||
    plan.seekSeconds >= targetDurationSeconds ||
    plan.loopEndSeconds > targetDurationSeconds
  ) {
    return null;
  }
  return plan;
}
