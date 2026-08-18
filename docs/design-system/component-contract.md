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
| Icon Button | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-407 | `apps/desktop/src/components/ui/button.tsx` | Icon-only actions require `aria-label`; use `size="icon-sm"`, `icon`, or `icon-lg`. |
| Input | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-471 | `apps/desktop/src/components/ui/input.tsx` | Text, URL, and file inputs; use native `type`, `placeholder`, `disabled`, and `aria-invalid`. |
| Badge | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-494 | `apps/desktop/src/components/ui/badge.tsx` | Compact metadata with `variant="default"`, `secondary`, `destructive`, `outline`, `ghost`, or `link`. |
| Tabs Trigger | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-517 | `apps/desktop/src/components/ui/tabs.tsx` | Pair `TabsList variant="default" | "line"` with `TabsTrigger`; do not render triggers outside a `Tabs` root. |
| Navigation Item | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-559 | `apps/desktop/src/App.tsx` | Feature-local `NAV_ITEMS` button pattern; active maps to `aria-current="page"` and inactive maps to `disabled`. |
| Progress | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-602 | `apps/desktop/src/components/ui/progress.tsx` | Use `value` for progress; add indicator color classes only for semantic tone. |
| Console Panel | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=18-632 | `apps/desktop/src/components/ui/card.tsx` | Use `Card`, `CardHeader`, `CardTitle`, and `CardContent`; `size="sm"` is the compact state. |
| BandScope Mark | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=19-163 | `apps/desktop/src/App.tsx` | Feature-local `BandScopeMark()` currently has no props; Figma size variants are visual guidance only. |
| Metric Card | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=19-216 | `apps/desktop/src/App.tsx` | Feature-local `MetricCard({ icon, label, value, detail, accent? })`. Metrics follow source controls on mobile. |
| Confidence Badge | https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk/Bandscope-Design-System-v1?node-id=19-239 | `apps/desktop/src/features/workspace/ConfidenceBadge.tsx` | Use `level: ConfidenceLevel` plus optional `size` (`"compact"` or `"default"`); the compact size remains the backward-compatible default. No `score` or `label` prop exists. |
| Overlap Warning List | extracted from Section Roadmap + Ranges | `apps/desktop/src/features/workspace/OverlapWarningList.tsx` | Shared clash list for Roadmap and Ranges; pass `warnings: string[]`. |
| Rehearsal Callout | workspace next-action pattern | `apps/desktop/src/features/workspace/RehearsalCallout.tsx` | First practice action after analysis; keep a visible button. |
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
- Figma node `19:239` has six variants: `Level=Low|Medium|High` crossed with `Size=Compact|Default`.
- Use `ConfidenceBadge` with `level` from shared types only: `low`, `medium`, `high`.
- Omit `size` to preserve the existing compact rendering; pass `size="default"` when the 26 px Figma state is required. Compact and default heights are workspace tokens corresponding to the 22 px and 26 px Figma variants at the default root font size.
- Do not pass `score` or `label` to `ConfidenceBadge`; those props do not exist in the runtime component.
- Storybook must retain both size states for every confidence level so design review can compare the complete Figma variant matrix.
- Keep badges short enough to avoid wrapping inside dense cards.

### Tabs

- Use `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent` together.
- Use `TabsList variant="line"` for compact timeline/navigation surfaces.
- Disabled triggers use the primitive `disabled` prop.

### Progress

- Use `Progress value={number}` for status progress.
- Tone-specific colors belong on `ProgressIndicator` or scoped child selectors.
- Provide adjacent live text when progress reflects an active asynchronous job.
