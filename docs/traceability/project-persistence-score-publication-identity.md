# Project Persistence → Score Publication Identity

## Problem

An app-owned BandScope project can be reopened from a durable `.bscope` document without carrying the original analysis bootstrap back into renderer state. `handleLoadProject()` intentionally clears `jobResultBootstrap`, but preserves the native-admitted `sourceReference.projectId` in `jobResultPublicationProjectId` after `loadProjectDocument()` has completed Project Persistence reopen/equality binding.

Before this repair, `ScoreView` still received `jobResultBootstrap?.projectId`. A reopened app-owned project therefore rendered the Score surface with `projectId=null` even though Project Persistence had already re-established the project's native publication identity. Score attachment read/attach/remove operations could remain disabled after restart/reopen while ordinary project mutations correctly used the restored publication identity.

This is an application-orchestration identity bug, not a reason for Score Storage to derive identity from filesystem paths or to copy Project Persistence authority.

## Constraints and decision

- Project Persistence remains the owner of app-owned project identity and restart/reopen admission.
- The only project identifier passed to Score UI orchestration is the path-free BandScope-minted id already accepted as `jobResultPublicationProjectId`.
- `ProjectBootstrapSummary` remains analysis/intake context. It is not the durable identity source for a reopened project.
- Portable documents with no admitted `sourceReference` continue to expose no Score Storage project authority; their publication project id remains `null`.
- Score Storage continues to own score PDF byte validation/publication/read/removal. This change does not move storage policy into Project Persistence or `App`.
- The repair does not infer or expose project paths, score paths, content hashes, or native capability identifiers.

## RED → causal fix

`8412c96bdf981aec98ccca2d7b6498f477ed3aae` is source-level RED evidence. `App.score-project-identity.test.tsx` reopens a project carrying a valid native-style `sourceReference`, switches to the Score surface, and requires `ScoreView` to receive that admitted project id. No hosted RED is claimed because no workflow run materialized for the test-only head before the descendant repair.

`0b43dad7fe4a1d78e84f16155fbca390390e611d` is the minimal causal repair: `ScoreView.projectId` is sourced from `jobResultPublicationProjectId`, the same Project Persistence identity already used by workspace mutation persistence, instead of the transient analysis bootstrap.

`3e30aaf6e54b27da0704310c1bda6e5a710bcc40`, `670a577d0391b30cc5640da94cf88eb7b9e1f932`, and `e323263ba8818c4ae8ef2101785d3b98975cb1dd` repair owner CI input tracking so the focused integration regression participates in the macOS/Windows Project Persistence workflow trigger contract. Those native lanes remain Rust execution authority; repository frontend CI remains the execution authority for the TypeScript App regression.

## Test points

- `App.score-project-identity.test.tsx` proves an admitted reopened `sourceReference.projectId` reaches the Score application boundary after `jobResultBootstrap` is cleared.
- Existing `ScoreView` and Score Storage tests remain responsible for attachment behavior once a valid project id is supplied.
- Project Persistence reopen/CAS tests remain responsible for deciding whether a source reference is valid and whether the app-owned workspace revision can be rebound.
- Exact-current-head repository CI must execute the TypeScript regression before frontend GREEN can be claimed.

## Security and failure boundary

Using `jobResultPublicationProjectId` narrows authority rather than broadening it. The value is populated from either a BandScope-minted local project selected for analysis or a successfully parsed/rebound native `sourceReference`; Score UI does not accept a user path as storage authority. When no such identity exists, the Score surface remains without attachment mutation authority.

This repair does not close the separate crash window in which score PDF bytes become durable before project attachment metadata is durably committed. That state still requires an explicit Project Persistence / Score Storage recovery-candidate contract; neither side may silently adopt or delete unreferenced buyer bytes.

## Remaining release work

Current-head frontend CI, security/SBOM/CodeQL settlement, independent review, packaged accessibility/locale evidence, score attachment restart reconciliation, packaged fault injection, signing/notarization, immutable release/provenance/reproducibility, and updater rollback remain release gates. This document must not be read as evidence that those gates are complete.
