/** Ready-workspace regions the sidebar can open after analysis. */
export type WorkspaceReadySurface = "export" | "sections" | "roles" | "cues" | "transpose";

/** Source-bar target for the Import nav item. */
export const SOURCE_CONTROLS_FOCUS_ID = "source-controls-choose-audio";

/** Focusable ready-workspace regions. */
export const WORKSPACE_SURFACE_IDS = {
  export: "workspace-surface-export",
  sections: "workspace-surface-sections",
  roles: "workspace-surface-roles",
  cues: "workspace-surface-cues",
  transpose: "workspace-surface-transpose"
} as const satisfies Record<WorkspaceReadySurface, string>;
