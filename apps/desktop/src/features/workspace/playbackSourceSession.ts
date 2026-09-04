import {
  derivePlaybackSourceOptions,
  type PlaybackSourceOption,
  type PlaybackSourceKind,
} from "./playbackSourceSelection";

/** Identity of one in-flight native availability lookup. */
export interface PlaybackSourceDiscoveryRequest {
  fullMixAuthority: string;
  sequence: number;
}

/** Renderer-owned playback-source state for the current native project authority. */
export interface PlaybackSourceSession {
  fullMixAuthority: string | null;
  options: PlaybackSourceOption[];
  pendingRequest: PlaybackSourceDiscoveryRequest | null;
  requestSequence: number;
  selectedAuthority: string | null;
}

function fullMixOnly(authority: string): PlaybackSourceOption[] {
  return [{ kind: "full_mix", authority }];
}

function isValidFullMixAuthority(authority: string | null | undefined): authority is string {
  return (
    typeof authority === "string" &&
    derivePlaybackSourceOptions(authority, [authority]) !== null
  );
}

function normalizeDiscoveredOptions(
  fullMixAuthority: string,
  discovered: unknown,
): PlaybackSourceOption[] | null {
  if (!Array.isArray(discovered)) {
    return null;
  }

  const declared: Array<{ kind: PlaybackSourceKind; authority: string }> = [];
  for (const candidate of discovered) {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      !Object.hasOwn(candidate, "kind") ||
      !Object.hasOwn(candidate, "authority")
    ) {
      return null;
    }
    const kind = (candidate as { kind?: unknown }).kind;
    const authority = (candidate as { authority?: unknown }).authority;
    if (
      (kind !== "full_mix" &&
        kind !== "vocals" &&
        kind !== "bass" &&
        kind !== "drums" &&
        kind !== "other") ||
      typeof authority !== "string"
    ) {
      return null;
    }
    declared.push({ kind, authority });
  }

  const canonical = derivePlaybackSourceOptions(
    fullMixAuthority,
    declared.map((option) => option.authority),
  );
  if (
    canonical === null ||
    canonical.length !== declared.length ||
    canonical.some(
      (option, index) =>
        option.kind !== declared[index]?.kind ||
        option.authority !== declared[index]?.authority,
    )
  ) {
    return null;
  }
  return canonical;
}

/** Start with only authority already owned by the mounted project. */
export function createPlaybackSourceSession(
  fullMixAuthority: string | null | undefined,
): PlaybackSourceSession {
  if (!isValidFullMixAuthority(fullMixAuthority)) {
    return {
      fullMixAuthority: null,
      options: [],
      pendingRequest: null,
      requestSequence: 0,
      selectedAuthority: null,
    };
  }
  return {
    fullMixAuthority,
    options: fullMixOnly(fullMixAuthority),
    pendingRequest: null,
    requestSequence: 0,
    selectedAuthority: fullMixAuthority,
  };
}

/**
 * Begin a refresh and immediately discard previously discovered stems.
 *
 * Native stem authority is revocable. Keeping old options visible while an async
 * refresh runs would let a stale button outlive the authority snapshot that created it.
 * Request identities never wrap: after the safe-integer sequence is exhausted the
 * session stays full-mix-only until a new session is created, so an ancient receipt
 * cannot become current again by colliding with a reused sequence number.
 */
export function beginPlaybackSourceDiscovery(
  state: PlaybackSourceSession,
  currentFullMixAuthority: string | null | undefined,
): {
  state: PlaybackSourceSession;
  request: PlaybackSourceDiscoveryRequest | null;
} {
  const currentSequence =
    Number.isSafeInteger(state.requestSequence) && state.requestSequence >= 0
      ? state.requestSequence
      : Number.MAX_SAFE_INTEGER;
  const nextSequence =
    currentSequence < Number.MAX_SAFE_INTEGER ? currentSequence + 1 : null;
  if (!isValidFullMixAuthority(currentFullMixAuthority)) {
    return {
      state: {
        fullMixAuthority: null,
        options: [],
        pendingRequest: null,
        requestSequence: nextSequence ?? currentSequence,
        selectedAuthority: null,
      },
      request: null,
    };
  }

  if (nextSequence === null) {
    return {
      state: {
        fullMixAuthority: currentFullMixAuthority,
        options: fullMixOnly(currentFullMixAuthority),
        pendingRequest: null,
        requestSequence: currentSequence,
        selectedAuthority: currentFullMixAuthority,
      },
      request: null,
    };
  }

  const request = {
    fullMixAuthority: currentFullMixAuthority,
    sequence: nextSequence,
  } satisfies PlaybackSourceDiscoveryRequest;
  return {
    state: {
      fullMixAuthority: currentFullMixAuthority,
      options: fullMixOnly(currentFullMixAuthority),
      pendingRequest: request,
      requestSequence: nextSequence,
      selectedAuthority: currentFullMixAuthority,
    },
    request,
  };
}

/** Apply only the latest matching discovery receipt; malformed results stay full-mix only. */
export function completePlaybackSourceDiscovery(
  state: PlaybackSourceSession,
  request: PlaybackSourceDiscoveryRequest | null,
  discovered: unknown,
): PlaybackSourceSession {
  if (
    request === null ||
    state.pendingRequest === null ||
    state.pendingRequest.sequence !== request.sequence ||
    state.pendingRequest.fullMixAuthority !== request.fullMixAuthority ||
    state.fullMixAuthority !== request.fullMixAuthority
  ) {
    return state;
  }

  let options: PlaybackSourceOption[];
  try {
    options =
      normalizeDiscoveredOptions(request.fullMixAuthority, discovered) ??
      fullMixOnly(request.fullMixAuthority);
  } catch {
    // Hostile getters/proxy traps cannot turn revoked availability into renderer state.
    options = fullMixOnly(request.fullMixAuthority);
  }
  const selectedAuthority = options.some(
    (option) => option.authority === state.selectedAuthority,
  )
    ? state.selectedAuthority
    : request.fullMixAuthority;

  return {
    ...state,
    options,
    pendingRequest: null,
    selectedAuthority,
  };
}

/** Select only an authority present in the current canonical option snapshot. */
export function selectPlaybackSource(
  state: PlaybackSourceSession,
  authority: string,
): PlaybackSourceSession {
  if (state.options.some((option) => option.authority === authority)) {
    return { ...state, selectedAuthority: authority };
  }
  return {
    ...state,
    selectedAuthority: state.fullMixAuthority,
  };
}
