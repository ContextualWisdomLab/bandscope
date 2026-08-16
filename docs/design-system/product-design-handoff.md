# Product Design Handoff

This is the repo mirror for Product Design material that must also live in the BandScope Figma file. If Figma is missing one of these details, treat that as a design-system defect before adding new code.

Figma file: https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk

## Product Scope

BandScope turns a local song source into a rehearsal workspace for players, singers, and publishers. The desktop app must support these jobs:

- Choose local audio or import a YouTube URL.
- Start analysis only after a valid source exists.
- Show pending, loading, error, and ready workspace states without blank panels.
- Review song structure, groove, role guidance, collaboration notes, and confidence.
- Export cue sheet, chart JSON, and handoff JSON from a ready workspace.
- Save and load local projects.

Out of scope for this handoff: new routes, cloud sharing, account settings, live collaboration, and a standalone component extraction unless the pattern is reused twice.

## Information Architecture

| Area | Purpose | Current surface | Runtime owner |
| --- | --- | --- | --- |
| App shell | Brand, primary rehearsal navigation, local-first reassurance | Desktop sidebar and compact mobile nav | `apps/desktop/src/App.tsx` |
| Source controls | Source selection, YouTube import, project open/save, start analysis | Top source-control band before metrics | `apps/desktop/src/App.tsx` |
| Analysis summary | Tempo, key, transpose, confidence, priority | Metric row below source controls | `apps/desktop/src/App.tsx` |
| Workspace state | Empty, loading, error, ready routing | Main content state card or workspace | `apps/desktop/src/App.tsx`, `WorkspaceStates.tsx` |
| Rehearsal workspace | Song header, export actions, timeline, roles, groove, section roadmap | Ready state workspace | `Workspace.tsx` and feature components |
| Export handoff | CSV, chart JSON, metadata handoff JSON | Ready workspace action group | `Workspace.tsx`, `lib/export` |

## Screen Definitions

| Screen/state | Entry condition | Primary action | Key content | Empty/error rule |
| --- | --- | --- | --- | --- |
| Workspace Home | No analyzed song and no active job | Choose local audio or import YouTube | Brand shell, source controls, pending metrics, actionable empty card | Empty card must explain next action; never show a blank canvas. |
| Source Selected | Valid local or YouTube source exists | Start Analysis | Selected source pill, enabled start button, pending metrics | Invalid source messages stay in the source-control band. |
| Analyzing | `isStarting`, queued, or running job | Wait; progress is informational | Loading card plus progress label/percent when available | Loading card uses live-region semantics. |
| Error | Job, import, load, or validation error | Choose another source, retry analysis, or load project | Safe redacted error copy | Error state uses alert semantics and must not leak local paths, URLs, or secrets. |
| Ready Workspace | `jobResult` exists | Review and export rehearsal output | Song header, export group, timeline, role switcher, groove map, section roadmap | Missing optional collaboration data uses copy, not empty modules. |

## Key Screens

1. `Workspace Home` is the first screen and must prioritize source controls above metrics on mobile and desktop.
2. `Analyzing` must confirm work is in progress through both the workspace state card and the compact progress region when progress exists.
3. `Ready Workspace` is the production handoff screen for players and publishers; exports stay in the song header, not hidden below analysis modules.
4. `Error` is a recovery screen; the user must still see the source controls above it.

## Wireframes

Desktop 1440px:

```text
+----------------------+--------------------------------------------------+
| Sidebar              | Source controls: title, local, YouTube, project |
| - Workspace active   | actions, Start Analysis                         |
| - Future views off   +--------------------------------------------------+
| - Local-first note   | Analysis summary metrics                         |
|                      +--------------------------------------------------+
|                      | Workspace state or Ready Workspace               |
|                      | - Empty/loading/error card                       |
|                      | - Ready: header, exports, timeline, roles, map   |
+----------------------+--------------------------------------------------+
```

Mobile 375px:

```text
+----------------------------------+
| Compact nav scroll               |
+----------------------------------+
| Source controls                  |
| - Title                          |
| - Choose local audio             |
| - YouTube URL + import           |
| - Open/Save/Start actions        |
+----------------------------------+
| Metrics, wrapping as needed      |
+----------------------------------+
| Workspace state or ready content |
+----------------------------------+
```

Wireframe rules:

- Source controls come before metrics at narrow widths.
- Primary action controls wrap before clipping.
- Ready workspace content can scroll vertically; horizontal timeline gets its own keyboard-focusable scroll region.
- Cards are used for real panels or repeated items only; do not nest decorative cards.

## User Stories

| Role | Story | Acceptance |
| --- | --- | --- |
| Player | As a player, I can choose a local audio file and start analysis only after the source is valid. | Start Analysis is disabled until `selectedBootstrap` exists; invalid selections show a safe source error. |
| Vocalist | As a vocalist, I can filter rehearsal guidance by role without losing song structure context. | Role switcher changes role-specific guidance while timeline and section roadmap remain visible. |
| Band leader | As a band leader, I can see which parts to lock in first and when those sections start. | The Rehearsal Priorities card names up to three role-and-section pairs with first entrance times, and opening a pair focuses that roadmap card. |
| Publisher | As a publisher, I can export cue sheet, chart, and handoff files from the ready workspace. | Export buttons exist only when `jobResult` exists and produce CSV/JSON downloads. |
| Privacy-conscious user | As a local-first user, I can recover from errors without exposing local paths, URLs, or secrets. | Error copy passes through `safeErrorDetail` and uses alert semantics. |

## Figma Coverage Checklist

- Page `32 Screen Blueprints` must include the desktop and mobile key-screen hierarchy above.
- Page `34 Workspace State Matrix` must include the five screen/state rows above.
- Page `31 Component Contract Catalog` must map source controls, metrics, workspace states, export group, role switcher, groove map, and section roadmap to runtime owners.
- Page `33 Figma-Only Readiness Audit` must note any auth-limited inspection, including whether `get_metadata` and `use_figma` were available.
- If Figma cannot be updated because the connector token is invalid, keep this repo mirror current and update Figma before merging the next visual-change PR.
