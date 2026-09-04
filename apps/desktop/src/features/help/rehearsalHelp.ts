/** Tonight's rehearsal-help phases. Each names one next action. */
export type RehearsalHelpPhase =
  | "choose-local-song"
  | "start-analysis"
  | "wait-for-analysis"
  | "retry-after-failure"
  | "open-rehearsal-map";

/** Discrete help-button actions that reuse existing App handlers. */
export type RehearsalHelpAction = "choose-local" | "start-analysis" | "focus-map" | "none";

/** Observable App state used to choose the help next-action. */
export interface RehearsalHelpSnapshot {
  hasLocalSource: boolean;
  analysisInFlight: boolean;
  hasSong: boolean;
  hasError: boolean;
}

/** Resolve the single next rehearsal action from current App state. */
export function resolveRehearsalHelpPhase(
  snapshot: RehearsalHelpSnapshot,
): RehearsalHelpPhase {
  if (snapshot.analysisInFlight) {
    return "wait-for-analysis";
  }
  if (snapshot.hasError && !snapshot.hasSong) {
    return "retry-after-failure";
  }
  if (snapshot.hasSong) {
    return "open-rehearsal-map";
  }
  if (snapshot.hasLocalSource) {
    return "start-analysis";
  }
  return "choose-local-song";
}

/** Map a help phase to the App handler it should invoke. */
export function rehearsalHelpAction(
  phase: RehearsalHelpPhase,
): RehearsalHelpAction {
  switch (phase) {
    case "choose-local-song":
    case "retry-after-failure":
      return "choose-local";
    case "start-analysis":
      return "start-analysis";
    case "open-rehearsal-map":
      return "focus-map";
    case "wait-for-analysis":
      return "none";
  }
}
