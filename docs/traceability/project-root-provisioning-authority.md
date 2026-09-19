# Project-root and app-owned workspace authority

## Problem

BandScope already rejected Unix symlinks and Windows reparse points when reopening an existing app-local project root, but the new-project path originally called `std::fs::create_dir_all` from the Tauri command boundary. That made creation authority weaker than reopen authority: a stable linked app-local base could redirect a newly minted project directory into a different filesystem subtree before local-audio materialization wrote project-owned bytes.

After the project-root repair, a second authority asymmetry remained. Cache and temp workspaces still used `create_dir_all(<app root>/<project_id>)`, and score storage still used `create_dir_all(<project root>/scores)`. A pre-existing symlink or junction at one of those locations could therefore redirect analysis output, YouTube import artifacts, temporary material, or attached score PDFs into a different local subtree even though the canonical project root itself was link-safe.

These are local filesystem authority defects, not claims of remote arbitrary-file access. They map to CWE-59 because an intended path can resolve through a link to an unintended resource. MITRE classifies the weakness as applicable to both Unix and Windows and notes confidentiality, integrity, and access-control consequences. Rust documents `create_dir_all` as recursive and non-atomic, implemented through repeated platform directory-creation calls; it does not provide a no-follow ancestor contract.

## Constraints

- Keep Project Persistence as the owner of app-local directory authority; do not move Resource Admission source semantics, score-content validation, or analysis-engine semantics into this module.
- Preserve the already-reviewed macOS `/etc`, `/tmp`, and `/var` root aliases only when they remain root-owned and resolve to the exact `/private/...` system target.
- Cache, temp, and score directories are reusable workspaces, unlike a newly minted project root, so hardening must not reject an ordinary existing real directory.
- Do not introduce process-global state, broad filesystem canonicalization as authorization, forceful deletion, or a platform-specific privilege requirement.
- Do not claim descriptor-bound ancestor stability: a component can still be replaced after metadata validation and before the next filesystem operation.

## RED

Project-root creation RED `834e561263224744f5a1af3c2c3e36d76155c216` adds Unix and Windows regressions requiring a linked/reparse app-local base to fail new-project provisioning without creating the project in the redirected target. `6e235a42dd3096b51a0f26f11dd17a72b772b61e` and `93da927696826149a9f742fbdc630fb74ab4d80a` add the previously missing project-root authority test path to the macOS and Windows owner workflows so this contract is hosted rather than test-file-only evidence.

Workspace RED `f45df9e73c815dca10e5e78326d6c2abb1db4073` extends the same owner harness with a reusable-workspace contract and real linked fixtures. Unix tests require a symlinked cache/temp ancestor and a symlinked `scores` directory to fail closed without creating data in the redirect target. Windows tests use junctions/reparse points for the same cases. The RED deliberately calls the missing `ensure_owned_directory` owner primitive, so a pre-fix descendant cannot compile or satisfy the contract merely because an unrelated path check exists elsewhere.

## Fix

`f566951e581d0fcf48ac8c9c806cb5ab5ff9570e` adds the original creation-side authority in `project_root.rs`:

- validate the minted `project_id` before joining;
- walk the lexical base chain from the filesystem root downward;
- inspect every existing component with `symlink_metadata` and reject Unix symlinks / Windows reparse points, subject only to the existing narrow macOS root-alias exception;
- create each missing base component with single-directory `create_dir`, then immediately verify that component as a real directory;
- create the final project directory with single-directory create semantics and refuse silent reuse of an existing project root.

`066a274015a1b0101d3b2ba0442448e63ca4c4e7` wires the Tauri new-project entry points (`select_local_audio_source` and `import_youtube_url`) to that owner. Existing-project callers use the existing-root resolver rather than creation semantics. `79eee50e7be4e6bac913f700be938115867261bc` adds the ordinary positive case and verifies that a second new-project provision attempt cannot silently reuse the directory.

Workspace fix `acd29bab38d9affd0333ca871efd4bca8af330be` adds `ensure_owned_directory`, reusing the same component-by-component no-follow/reparse checks while allowing an ordinary existing final directory. `4b178020c681097f205bd474f62ab6c41a59fbb6` replaces the remaining production `create_dir_all` calls for cache/temp roots and `<project>/scores` with that owner primitive. An unrelated queued-progress edit introduced while replacing the large `main.rs` file was detected from the exact commit diff and restored immediately by ordinary descendant `c6d8c5e44d2f58a2d0b61758f11a9ae0f639fa66`; no force-push or destructive history edit was used.

## Alternatives rejected

`create_dir_all` followed by validation was rejected because filesystem objects can already be created under a redirected ancestor before the later check. Canonicalizing a base and accepting the canonical target was rejected because that turns redirection into authority rather than rejecting it. A process-wide lock does not prevent another process or local principal from replacing a directory entry. Treating cache/temp/scores exactly like a fresh project root was also rejected because those workspaces have legitimate reuse semantics. Platform-specific symlink creation privileges are irrelevant to detecting already-present Windows reparse points, so Windows regressions use junction fixtures.

## Security Notes

### Attack surface

The affected surface is local project bootstrap, analysis workspace preparation, YouTube import output, restart restoration of cache/temp state, and score attachment/read/remove preparation at the Tauri filesystem boundary. The untrusted condition is a pre-existing Unix symlink, Windows reparse-point/junction, or replaced directory component inside the lexical app-owned root chain. No renderer-supplied absolute path is accepted by these directory-authority APIs; `project_id` remains a BandScope-shaped identifier.

### Trust boundary

Authority crosses the `Storage Boundary` defined by `docs/security/app-security.md`: BandScope may create project, cache, temp, and score artifacts only under the Tauri-resolved app-owned roots and a validated project root. A linked ancestor or linked final workspace must not silently convert that path into authority over another filesystem subtree. Resource Admission remains a consumer of the resulting project/cache paths; score-content validation remains in its existing core helpers.

### Realistic threats

A local process or user with permission to prepare an entry inside a relevant app-owned parent could place a symlink or junction before BandScope provisions or reopens a workspace. Without the checks, later source materialization, analysis/YouTube output, or score-copy operations could write beneath the redirected destination. The current model does not treat an attacker who can replace ancestors between individual metadata checks and filesystem operations as fully mitigated.

### Mitigations

Every existing lexical component is inspected with `symlink_metadata`; Unix symlinks and Windows reparse points fail closed. Missing components are created one at a time and immediately revalidated rather than recursively followed through `create_dir_all`. Only the existing exact root-owned macOS `/etc`, `/tmp`, and `/var` aliases are admitted. Fresh project roots still use one-shot `create_dir` and refuse reuse, while cache/temp/scores use `ensure_owned_directory` so a verified ordinary existing directory can be reused without accepting a link/reparse endpoint.

### Safe failure, logging, and privacy

Rejected authority returns the existing generic workspace-specific error at the Tauri boundary. The implementation does not log the rejected path, local username, project payload, raw audio, URL, or score bytes. It does not delete or rewrite a foreign link target when validation fails. No new network path, telemetry, or PII collection is introduced.

### Test points

Unix coverage uses real symlinks for app-local project creation/reopen, cache/temp workspace redirection, and `scores` redirection. Windows coverage uses real junction/reparse-point fixtures for the corresponding cases. Positive cases cover ordinary nested project provisioning, project-root no-reuse, and reusable ordinary app-owned workspace directories. These cases remain inside the single warning-gated Project Persistence native harness and must be GREEN on the unchanged exact source head before acceptance.

### Remaining risk

The implementation remains path-based, not descriptor-relative. A directory component replaced after validation but before a following operation can still change path resolution; closing that requires a platform-specific descriptor/handle-bound design. The present change also does not establish restrictive Unix mode/Windows ACL policy for every cache/temp/scores child artifact, retention/cleanup policy, packaged interruption behavior, disk-full handling, permission-failure UX, cancellation behavior, or power-loss durability.

## Evidence and claim boundary

Primary references:

- MITRE. (2026). *CWE-59: Improper Link Resolution Before File Access (Link Following).* https://cwe.mitre.org/data/definitions/59
- Rust Project Developers. (2026). *std::fs::create_dir_all.* https://doc.rust-lang.org/std/fs/fn.create_dir_all.html

Acceptance requires exact-source Windows and macOS owner workflow GREEN after the cache/temp/scores wiring and this traceability update; predecessor native results do not transfer. The current repair closes **stable linked/reparse redirection for new/existing app-local project-root authority and reusable cache/temp/scores directory authority**. It does not prove descriptor-relative no-follow semantics against a component swapped between checks, does not duplicate Resource Admission or score-content semantics, and is not packaged process-kill or power-loss evidence.