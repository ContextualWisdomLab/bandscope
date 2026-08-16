# Metadata handoff import

BandScope metadata handoffs let one musician share rehearsal scope without embedding or transmitting audio. The receiving BandScope installation imports a small JSON artifact, shows its workspace and song context, and reuses the focused role identifiers only after the recipient explicitly chooses a local audio file. Any source references in the artifact remain inert metadata and are never treated as authority to read recipient files.

## Recipient workflow

1. Select **Import Handoff** in the source controls.
2. Choose a `.json` handoff exported by BandScope. Importing or replacing a handoff clears any previously selected audio so unrelated source context cannot be reused accidentally. All competing source actions and **Open Project** remain disabled while the selected handoff is being read and validated, preventing an in-flight handoff result from being applied after a project replacement. Project loading uses the symmetric lock: while an **Open Project** operation is pending, local-audio selection, handoff import/replacement, YouTube import, analysis start, project reload, and saving the prior project remain disabled until the load settles, so a stale async source result cannot overwrite the newly loaded project context. After handoff validation, **Choose local audio** is the only source-selection action available for the pending handoff; YouTube import stays unavailable until the handoff is cleared or consumed by a successful analysis.
3. Confirm the displayed workspace, song, and focused-role count.
4. Select the recipient's own local audio copy.
5. Start analysis. BandScope creates a local-audio analysis request with the imported role focus.
6. Clear or replace the pending handoff at any time before the analysis starts. Clearing the handoff does not discard an audio source selected after that handoff.

Importing metadata never starts analysis automatically and never dereferences file paths or URLs carried by the artifact. Source selection, project loading, analysis-start, and handoff-control handlers independently reject stale overlapping transitions even if a UI component fails to enforce its disabled state. In particular, a picker result delivered after the parent has disabled handoff import is discarded before file validation, and stale import/clear button activation is ignored; DOM disablement is an accessibility/usability layer, not the sole state-authority boundary.

## Focus enforcement and cache behavior

The analysis engine builds and caches the complete reusable song analysis, then projects the response onto `roleFocus` before returning it to the desktop. This keeps stem and analysis caches reusable across bandmates while ensuring that a focused handoff does not silently return unrelated role rows.

For a non-empty role focus:

- each section retains only requested role payloads;
- part-graph nodes outside the focus are removed;
- `handoff_to` and `handoff_from` links are limited to retained roles;
- export focus sections are recalculated from sections that contain a retained role.

An explicitly empty `roleFocus` continues to mean “all analyzed roles.” The full cached analysis is never overwritten by a recipient-specific projection.

## Validation boundary

The desktop reads at most 1 MiB plus one sentinel byte from the selected file. It then requires:

- a `.json` file name;
- a safe integer file size within the limit;
- strict UTF-8 decoding;
- valid JSON;
- the supported `bandscope.metadata-handoff` artifact kind and version;
- the complete shared-types handoff contract.

Failures are mapped to bounded localized error codes. Local paths, parser payload fragments, and file contents are not echoed into the interface.

## Privacy and authority

A handoff carries metadata references and focused role identifiers, not audio bytes. It grants no filesystem, network, calendar, database, or model authority. A pending handoff cannot be paired through YouTube import: the recipient explicitly chooses a local audio source, and the existing local-first analysis boundary remains authoritative.

## Developer API

The UI boundary is implemented by:

- `readMetadataHandoffFile` for bounded file intake and validation;
- `handoffRoleFocus` for ordered role deduplication;
- `createAnalysisRequestForSelection` for preserving the normal request path until both a local source and valid handoff are present;
- `HandoffImportControl` for accessible import, replace, progress, summary, clear, validation-activity controls, and handler-level rejection when source-transition authority is no longer held;
- `_focus_rehearsal_song` for non-mutating backend result projection over complete cached analysis.

Tests cover valid import, malformed and oversized input, invalid UTF-8, unsupported artifacts, cancellation, replacement, deduplication, payload-free errors, source-action and project-load exclusion during handoff validation, reciprocal source/handoff exclusion during project loading, handler-level rejection of bypassed overlapping local-source/project/analysis transitions and stale handoff picker/change/clear events, YouTube exclusion while a validated handoff awaits its local source, explicit local-source selection and re-selection, cache-safe role projection, graph-link filtering, and successful pending-state cleanup.