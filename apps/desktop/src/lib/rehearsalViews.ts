/** Primary rehearsal destinations that own a real content surface. */
export type RehearsalView = "workspace" | "score" | "stems";

/**
 * Return whether a sidebar view can be opened in the current analysis state.
 */
export function isNavigableView(view: RehearsalView | null, hasSong: boolean): boolean {
  if (view === null) {
    return false;
  }
  switch (view) {
    case "workspace":
    case "stems":
      return true;
    case "score":
      return hasSong;
    default: {
      const _exhaustive: never = view;
      return _exhaustive;
    }
  }
}

/**
 * Keep the visible rehearsal view honest when the selected destination is not ready.
 */
export function resolveCurrentView(activeView: RehearsalView, hasSong: boolean): RehearsalView {
  switch (activeView) {
    case "workspace":
      return "workspace";
    case "stems":
      return "stems";
    case "score":
      return hasSong ? "score" : "workspace";
    default: {
      const _exhaustive: never = activeView;
      return _exhaustive;
    }
  }
}
