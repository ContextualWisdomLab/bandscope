import {
  isRehearsalPlaybackRate,
  type RehearsalPlaybackRate,
  type RehearsalTransportPhase,
  type RehearsalTransportState,
} from "./rehearsalTransport";
import { playbackSourceProjectId } from "./playbackSourceSelection";

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

/** Renderer-owned identity state for the mutable HTML media source lifecycle. */
export interface PlaybackSourceSwitchSession {
  sequence: number;
  activePlan: PlaybackSourceSwitchPlan | null;
}

function hasValidSwitchIdentity(identity: PlaybackSourceSwitchIdentity): boolean {
  const sourceProjectId = playbackSourceProjectId(identity.sourceAuthority);
  const targetProjectId = playbackSourceProjectId(identity.targetAuthority);
  return (
    sourceProjectId !== null &&
    sourceProjectId === targetProjectId &&
    identity.sourceAuthority !== identity.targetAuthority &&
    Number.isSafeInteger(identity.sequence) &&
    identity.sequence > 0
  );
}

function freezePlaybackSourceSwitchSession(
  sequence: number,
  activePlan: PlaybackSourceSwitchPlan | null,
): PlaybackSourceSwitchSession {
  return Object.freeze({ sequence, activePlan });
}

/** Start a renderer switch session with no reusable media receipt. */
export function createPlaybackSourceSwitchSession(): PlaybackSourceSwitchSession {
  return freezePlaybackSourceSwitchSession(0, null);
}

/**
 * Capture transport continuity before replacing the media source.
 *
 * Count-in changes are deliberately rejected: changing media while the independent
 * count-in clock is running would create a second timing race. Looping/paused
 * switches retain the exact admitted media position; armed switches start from the
 * selected loop boundary. Invalid positions or switch identities fail closed rather
 * than being clamped or converted into an ambiguous no-op. Source and target must
 * both be canonical opaque authorities for the same mounted playback project.
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

  return Object.freeze({
    ...identity,
    loopStartSeconds: loop.startSeconds,
    loopEndSeconds: loop.endSeconds,
    seekSeconds,
    playbackRate: transport.playbackRate,
    sourcePhase: transport.phase,
    resumeAfterLoad: transport.phase === "looping",
  });
}

/**
 * Begin one media-source replacement and invalidate every older metadata receipt.
 *
 * The sequence is burned before continuity capture. A rejected target or transport
 * phase therefore cannot leave an older `loadedmetadata` receipt authoritative.
 * Sequence values never wrap; exhaustion clears the active plan until the player
 * mounts a fresh switch session. Issued receipts and session identities are frozen
 * so later renderer code cannot rewrite what a future metadata event is allowed to
 * restore.
 */
export function beginPlaybackSourceSwitch(
  state: PlaybackSourceSwitchSession,
  transport: RehearsalTransportState,
  currentMediaTimeSeconds: number,
  sourceAuthority: string,
  targetAuthority: string,
): { state: PlaybackSourceSwitchSession; plan: PlaybackSourceSwitchPlan | null } {
  const currentSequence =
    Number.isSafeInteger(state.sequence) && state.sequence >= 0
      ? state.sequence
      : Number.MAX_SAFE_INTEGER;
  if (currentSequence >= Number.MAX_SAFE_INTEGER) {
    return {
      state: freezePlaybackSourceSwitchSession(Number.MAX_SAFE_INTEGER, null),
      plan: null,
    };
  }

  const sequence = currentSequence + 1;
  const plan = capturePlaybackSourceSwitch(
    transport,
    currentMediaTimeSeconds,
    {
      sourceAuthority,
      targetAuthority,
      sequence,
    },
  );
  return {
    state: freezePlaybackSourceSwitchSession(sequence, plan),
    plan,
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
