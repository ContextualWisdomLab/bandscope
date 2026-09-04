# Component Contract

This contract connects the BandScope Figma design system to production React components without requiring Figma Code Connect or Figma platform publishing.

Figma file: https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk

The authoritative Figma view is `31 Component Contract Catalog`. This file mirrors that page for review only.

## Canonical Components

| Figma component | Figma node | Code path | Use |
| --- | --- | --- | --- |
| Button / Default | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-84 | `apps/desktop/src/components/ui/button.tsx` | Primary actions with `variant="default"` and `size="default"`, `sm`, or `lg`. |
| Button / Outline | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-121 | `apps/desktop/src/components/ui/button.tsx` | Secondary or framed actions with `variant="outline"`. |
| Button / Secondary | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-167 | `apps/desktop/src/components/ui/button.tsx` | Low-emphasis filled actions with `variant="secondary"`. |
| Button / Ghost | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-213 | `apps/desktop/src/components/ui/button.tsx` | Toolbar actions with `variant="ghost"`. |
| Button / Destructive | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-250 | `apps/desktop/src/components/ui/button.tsx` | Destructive or high-risk actions with `variant="destructive"`. |
| Button / Link | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-287 | `apps/desktop/src/components/ui/button.tsx` | Inline actions with `variant="link"` and usually `size="sm"`. |
| Button / Source | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-324 | `apps/desktop/src/components/ui/button.tsx` | Design pattern only. Runtime uses `variant="secondary"` or `variant="outline"` plus source-control `className`; no dedicated source Button variant exists yet. |
| Icon Button | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-407 | `apps/desktop/src/App.tsx`, `apps/desktop/src/components/ui/button.tsx` | Icon-only actions require `aria-label`; use `size="icon-sm"`, `icon`, or `icon-lg`. The Settings control is enabled and names the next audio action. |
| Input | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-471 | `apps/desktop/src/components/ui/input.tsx` | Text, URL, and file inputs; use native `type`, `placeholder`, `disabled`, and `aria-invalid`. |
| Badge | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-494 | `apps/desktop/src/components/ui/badge.tsx` | Compact metadata with `variant="default"`, `secondary`, `destructive`, `outline`, `ghost`, or `link`. |
| Tabs Trigger | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-517 | `apps/desktop/src/components/ui/tabs.tsx` | Pair `TabsList variant="default" | "line"` with `TabsTrigger`; do not render triggers outside a `Tabs` root. |
| Navigation Item | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-559 | `apps/desktop/src/App.tsx` | Feature-local `NAV_ITEMS` button pattern; active maps to `aria-current="page"` and inactive maps to `disabled`. |
| Progress | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-602 | `apps/desktop/src/components/ui/progress.tsx` | Use `value` for progress; add indicator color classes only for semantic tone. |
| Console Panel | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-632 | `apps/desktop/src/components/ui/card.tsx` | Use `Card`, `CardHeader`, `CardTitle`, and `CardContent`; `size="sm"` is the compact state. |
| BandScope Mark | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=19-163 | `apps/desktop/src/App.tsx` | Feature-local `BandScopeMark()` currently has no props; Figma size variants are visual guidance only. |
| Metric Card | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=19-216 | `apps/desktop/src/App.tsx` | Feature-local `MetricCard({ icon, label, value, detail, accent? })`. Metrics follow source controls on mobile. |
| Confidence Badge | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=19-239 | `apps/desktop/src/features/workspace/ConfidenceBadge.tsx` | Use `level: ConfidenceLevel`; no `score` or `label` prop exists in current code. |
| Status Pill | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=19-283 | `apps/desktop/src/features/workspace/Workspace.tsx` | Design pattern only. Current code uses `formatStatusLabel(status)` inside local badge-like markup. |
| Role Switcher | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=19-337 | `apps/desktop/src/features/workspace/RoleSwitcher.tsx` | Use `roles`, `activeRole`, and `onRoleChange`; `null` means all roles. |
| Section Roadmap Card | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=19-402 | `apps/desktop/src/features/workspace/SectionRoadmap.tsx` | Use `song`, `activeRole`, and optional `onSongUpdate`; avoid rebuilding its internal card layout. |
| Song Structure Timeline | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=19-457 | `apps/desktop/src/features/workspace/Workspace.tsx` | Feature-local `SongStructure({ sections, t })` memo component; not exported. |
| Groove Map | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=19-526 | `apps/desktop/src/features/workspace/GrooveMap.tsx` | Use `notes?: TranscriptionNote[]` and `isLoading?: boolean`; preserve scrollable region semantics and note labels. |
| Source Control Stack | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=19-655 | `apps/desktop/src/App.tsx` | Feature-local source controls for local audio, YouTube URL import, project actions, and Start Analysis; keep before metrics at 375px. |
| Export Action Group | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=19-731 | `apps/desktop/src/features/workspace/Workspace.tsx` | Feature-local export buttons call `handleExportCueSheet`, `handleExportChart`, and `handleExportHandoff`. |
| Workspace State Matrix | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=99-560 | `apps/desktop/src/features/workspace/WorkspaceStates.tsx`, `apps/desktop/src/App.tsx` | Whole-workspace empty, loading, error, and ready state routing; use before changing `renderWorkspaceState()`. |

## Prop And State Mapping

### Button

- Figma `Size=Compact` maps to `size="sm"` for text buttons and `size="icon-sm"` for icon buttons.
- Figma `Size=Default` maps to `size="default"` for text buttons and `size="icon"` for icon buttons.
- Figma `Size=Touch` maps to `size="lg"` or `size="icon-lg"`; add `min-h-11` only when the surrounding layout needs a larger hit target.
- Figma `State=Disabled` maps to the native `disabled` prop.
- Figma focused states must be implemented through existing `focus-visible` classes, not custom hover-only styling.
- Figma `Button / Source` is a source-control pattern, not a runtime variant. Use `variant="secondary"` or `variant="outline"` with the documented source-control `className` until a dedicated variant is added to `button.tsx`.

### Input

- Figma `Type=Text`, `URL`, and `File` map to native `type="text"`, `url`, and `file`.
- Figma `State=Error` maps to `aria-invalid`.
- Figma `State=Disabled` maps to `disabled`.
- Keep placeholder text useful; do not use placeholder text as the only label for important workflows.

### Badge And Confidence

- Use `Badge` for general metadata and `ConfidenceBadge` for confidence status.
- Use `ConfidenceBadge` with `level` from shared types only: `low`, `medium`, `high`.
- Do not pass `score` or `label` to `ConfidenceBadge`; those props do not exist in the current runtime component.
- Keep badges short enough to avoid wrapping inside dense cards.

### Tabs

- Use `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent` together.
- Use `TabsList variant="line"` for compact timeline/navigation surfaces.
- Disabled triggers use the primitive `disabled` prop.

### Progress

- Use `Progress value={number}` for status progress.
- Tone-specific colors belong on `ProgressIndicator` or scoped child selectors.
- Provide adjacent live text when progress reflects an active asynchronous job.

### Workspace States

- Figma page `34 Workspace State Matrix` maps `EmptyState`, `LoadingState`, `ErrorState`, ready `Workspace`, `GrooveMap`, and Source Control Stack substates.
- `App.tsx` must preserve the current routing order: `jobError` -> `ErrorState`, `analysisInFlight || isStarting` -> `LoadingState`, `jobResult` -> `Workspace`, otherwise `EmptyState`.
- `LoadingState` keeps `role="status"`, `aria-live="polite"`, `aria-atomic="true"`, and `aria-busy="true"`.
- `ErrorState` keeps `role="alert"`, `aria-live="assertive"`, and visible safe error detail copy.
- `EmptyState` must remain an actionable state card, not a blank placeholder panel.
- If a new workspace state is added in code, update Figma page 34 and page 33 audit evidence before merging.

## Pattern Backlog

These Figma patterns are valid visual guidance but are not yet extracted as standalone code components. Use the existing feature markup and open a follow-up extraction task when reuse appears twice.

| Figma pattern | Current implementation home | Extraction trigger |
| --- | --- | --- |
| Source Control Stack | `apps/desktop/src/App.tsx` source controls section | Extract when another intake surface needs the same local audio, YouTube URL import, project, and analysis actions. |
| Navigation Item | `apps/desktop/src/App.tsx` shell navigation | Extract when navigation appears outside the app shell. |
| Metric Card | `apps/desktop/src/App.tsx` `MetricCard` | Extract when metrics move into feature pages or dashboards. |
| Status Pill | `apps/desktop/src/features/workspace/Workspace.tsx` | Extract when assignment/comment/approval status UI is reused. |
| Song Structure Timeline | `apps/desktop/src/features/workspace/Workspace.tsx` | Extract when timeline editing or playback controls are added. |
| Export Action Group | `apps/desktop/src/features/workspace/Workspace.tsx` | Extract when export controls are reused outside the workspace header. |

## PR Review Rules

- New UI should cite the matching Figma node and code path in the PR description when it implements a design-system component.
- A new component variant must update this file, the relevant component tests, and the Figma component notes.
- A new Figma-only pattern must enter the Pattern Backlog before being reused.
- Any deliberate visual divergence from Figma should state whether the repo contract or accessibility requirement caused it.
- Workspace state changes must cite page `34 Workspace State Matrix` or explain why Figma was updated first.
- Do not add Code Connect, Figma token, or Figma publish requirements to CI.
