<!-- /autoplan restore point: /Users/seonghobae/.gstack/projects//feature-issue-152-collaboration-autoplan-restore-20260425-230327.md -->
# Plan: V2 Advanced Rehearsal Collaboration Features

Status: APPROVED

## Problem Statement
With V1 providing individual rehearsal certainty via part stems and section guidance, and V1.1 enabling metadata-only local handoff, bands can now share static rehearsal artifacts. However, a major pain point remains: rehearsal preparation is inherently conversational and dynamic. 
Band leaders need to communicate specific simplification requirements ("play root notes only here"), suggest transpositions, or flag difficult transitions. Currently, this collaboration happens outside the app (in WhatsApp or physical notes), leading to disconnected workflows where the context is lost when opening BandScope.

## Scope
- **Assignment Semantics**: Allow assigning specific roles to specific band members within the shared workspace.
- **Contextual Comments**: Enable adding text annotations directly to specific sections or roles in the `SongRehearsalPack` (e.g., "Simplify bassline in Chorus 2").

## Out of Scope
- **Approvals & Status**: Let band members mark their assigned parts as "Ready" or "Needs Help."
- **Cloud Sync Backbone**: Introduce an opt-in cloud synchronization mechanism to replace local file sharing, allowing real-time or near-real-time updates to the rehearsal workspace.
- Built-in audio/video calling.
- Complex branching/version control of rehearsal workspaces.
- Deep integration with external task managers (Jira, Trello).


## CEO Review Completion Summary
- Mode: SCOPE REDUCTION
- Scope Decisions:
  - Approved: Scrap the Cloud Sync Backbone entirely to protect the local-first wedge and avoid massive operational/security overhead. Rely on existing V1.1 local handoff.
  - Approved: Scrap formal "Status/Approval" workflows ("Ready", "Needs Help"). Bands are not enterprises; do not build Jira for musicians.
  - Approved: Focus exclusively on **Contextual Annotations** (e.g., "play root notes here") that save to the local file.
  - Approved: Add **Deep Links / Annotated Snippets** to embrace WhatsApp/group chats rather than fighting them. A band leader can copy a rich text snippet that deep-links into the local BandScope app at the exact section.
- Dual Voices: `[single-model]` (Codex unavailable, Claude subagent provided 5 critical/high findings).


## Design UI/UX Specifications

### Information Architecture & Interactions
- **Annotations UI**: Live in a persistent but collapsible right-side drawer, or as tightly packed inline badges above section headers, ensuring the music timeline remains primary.
- **Triggers**: Add an "Add Note" icon button that appears on hover next to section headers and role rows. Add a "Copy Link" action to the ellipsis menu for every section.
- **Role Assignment**: Assignment acts as a visual highlight, not a hard filter. Highlighting a role dims other instruments slightly but keeps them visible for rehearsal awareness.

### Interaction States
- **Deep-Link Error State**: If a deep link opens and the local `.bndscp` file is missing, show an empty state: "Song not found. Ask the leader to share the .bandscope file first" with a giant "Import File" CTA.
- **Empty Annotations**: Zero-data state for the annotation panel: "No notes for this section."

### User Journey
- **Handoff Snippet**: The copied deep link must include a plain-text fallback. Example:
  `We're struggling with the bridge. Play root notes only. 1. Open the song file in BandScope. 2. Click this link: bandscope://song/123/section/bridge`

## Design Review Completion Summary
- Initial Score: 3/10
- Final Score: 10/10
- Decisions Made: 5 structural issues fixed via Claude Subagent.
- Dual Voices: `[single-model]` (Codex unavailable).


## Engineering Review Completion Summary
- Initial Assessment: Critical gaps in local sync conflict resolution, URL scheme security, and OS integration testing.
- Final State: Deep-link security bounded, conflict resolution scoped to append-only logs, and E2E testing mandated.
- Dual Voices: `[single-model]` (Codex unavailable, Claude subagent provided 5 critical/high findings).

### Architecture & Conflict Resolution
- **Merge Strategy**: Because we dropped cloud sync, `.bndscp` files will diverge. Annotations must be modeled as an append-only log (with UUIDs and timestamps). When opening a shared file for an existing song, the app must merge new annotations into the local state instead of blindly overwriting.
- **Dimming Performance**: "Highlighting a role" MUST bypass React re-renders of the heavy waveform components. Use CSS variables or opacity transitions on parent containers to dim non-active tracks purely via the GPU.

#
## Security Notes
### Attack Surface
Custom URI payloads (e.g., `bandscope://song/123/section/bridge`) are untrusted external input crossing the OS-to-App boundary.

### Trust Boundary
The deep-link parser logic forms a strict boundary between OS URL handling and React component rendering.

### Mitigations
Strict regex validation is enforced for deep link payloads (e.g., IDs must match `^[a-zA-Z0-9-]+$`). The URI payload is NEVER used directly in file system calls or raw DOM injection to prevent Local File Inclusion (LFI) and XSS.

### Realistic Threats
Maliciously crafted `bandscope://` links intended to execute arbitrary local files or run XSS payloads within the UI context.

### Remaining Risk
Minor risk of deep link parser denial-of-service on extreme string lengths, but limited to individual application instances.

### Test Points
- Malicious URI payload injections via hash routes.
