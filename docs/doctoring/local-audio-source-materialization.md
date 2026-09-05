# Local audio source materialization

## Problem

The desktop intake boundary previously validated an OS-selected local audio file, then stored the canonical external filesystem path in `ProjectBootstrapSummaryPayload`. Analysis could therefore reopen bytes from a path the application did not own after the original metadata admission. A source could be moved, replaced, truncated, or grown between selection and analysis, and process restart could not reconstruct a trustworthy full-mix source from app-owned project state.

Issue #962 now makes durable local-source re-admission a Project Persistence prerequisite. That satisfies the existing application-security condition that copying selected media is justified when persistence requirements require an additional storage boundary. Resource Admission & Decode owns creation of that app-owned audio artifact; Project Persistence owns only the versioned reference and migration contract that consumes it.

## Constraints

- Local analysis remains local-first and introduces no network or generic filesystem capability.
- The renderer must not choose an arbitrary path for analysis or persistence.
- The encoded-byte ceiling remains 100 MiB.
- An initial metadata length is not sufficient evidence if the selected file changes while it is being admitted.
- The user-visible source label may preserve the selected filename, but analysis authority must move to app-owned storage.
- The change must not claim that project reopen, SHA-256 identity, YouTube source persistence, power-loss recovery, or commercial decoder licensing is already complete.

## Alternatives

1. Keep the canonical external path and revalidate immediately before every analysis. Rejected because process restart still depends on mutable external authority and durable project references remain non-portable.
2. Persist the absolute external path in the `.bscope` document. Rejected because #962 explicitly separates portable project identity from arbitrary host paths and because it widens disclosure and authority.
3. Copy the selected local file into the project root after native admission. Selected. It produces the stable `source.<extension>` artifact expected by the Project Persistence source-reference contract without allowing the renderer to mint filesystem authority.

## Implementation and exact evidence

- `dbeee9c7407c72f999f584eb0eb9342ddc39fddd` adopted protected `develop@314ddeae7b775a4957594b599358c8255617eb2e` as an ordinary second parent with no force push. The Resource Admission semantic delta remains a descendant of the current protected base.
- RED `804a2867e877947feaffb1da6c6072e6a49049fe` added bounded-copy regressions for exact-limit acceptance and one-byte-over growth rejection.
- Core fix `0beee45b98e51ba46b571a82c6d0d93db61ea8d6` added `copy_bounded_local_audio`, which reads at most the configured ceiling plus one byte and returns the observed byte count.
- Native integration `a2b1bd9e33a69be75f813f005abd37345200ce55` creates the project root before source admission, opens the OS-selected source natively, stages bytes under that project root, flushes the staged file, and publishes `source.<extension>` only after bounded copy succeeds. `ProjectBootstrapSummaryPayload.source.sourcePath` now points at the app-owned artifact for local-file intake.
- Source review of that integration found that the new core port was public inside `audio_resource.rs` but not re-exported from the crate root consumed by Tauri. `323a7fac00c4954af12b382802a9d6f8359ef4c5` is the minimal causal repair: it re-exports `copy_bounded_local_audio` without changing the admission policy or widening authority. Hosted evidence must be reacquired on the final descendant rather than transferred from either predecessor.

## Security Notes

### Untrusted inputs and trust boundaries

The selected audio path, file metadata, and media bytes remain untrusted. The OS file dialog supplies the initial path, but the path is used only to resolve and open the user-selected source. The resulting app-owned project root is the storage trust boundary used for subsequent analysis authority.

### Validation and safe failure

The extension allowlist and descriptor-observed non-zero/100 MiB encoded-size policy remain unchanged. The bounded copy reads at most 100 MiB plus one byte, so growth after the initial metadata check fails closed without unbounded allocation or copying. A unique private stage is removed on copy or flush failure. The final source artifact is not published until the staged file has been flushed successfully. Errors remain bounded product messages and do not include the original local path.

### Logging and privacy

No new logging, telemetry, network transfer, or path exposure is introduced. The original filename remains a user-facing label already present in the bootstrap contract; the original absolute path is no longer the local-analysis source path after successful admission.

### Test points

- exact encoded-byte limit remains accepted;
- one-byte-over growth while copying is rejected;
- empty source remains rejected;
- failed copy or flush does not publish the final project-owned source artifact;
- Tauri must compile against the exported Resource Admission port;
- hosted Rust/Tauri, Windows, macOS, security, SBOM, and review gates must be reacquired on the final exact PR head.

## Remaining risks and follow-up

This slice is not the complete restart/reopen contract. Resource Admission still needs a streaming content identity receipt, preferably SHA-256 computed from the same admitted bytes, so #970/#962 can persist `project_id + artifact_name + extension + observed byte count + digest` without trusting renderer-generated evidence. Reopen must then resolve only the app-owned artifact, revalidate observed size and digest, and mint fresh playback authority. YouTube intake still uses its owned cache artifact and needs an explicit durable-source promotion decision. Parent-directory durability and exhaustive power-loss injection remain separate recovery work. Issue #1129 remains the commercial decoder dependency gate and is not changed by this materialization boundary.
