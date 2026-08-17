/** Ready-workspace regions the sidebar can open after analysis. */
export type WorkspaceReadySurface = "export" | "sections" | "roles" | "cues" | "transpose";

export /** Source-bar target for the Import nav item. */
const SOURCE_CONTROLS_FOCUS_ID = "source-controls-choose-audio";

export /** Focusable ready-workspace regions. */
const WORKSPACE_SURFACE_IDS = {
  export: "workspace-surface-export",
  sections: "workspace-surface-sections",
  roles: "workspace-surface-roles",
  cues: "workspace-surface-cues",
  transpose: "workspace-surface-transpose"
} as const satisfies Record<WorkspaceReadySurface, string>;
