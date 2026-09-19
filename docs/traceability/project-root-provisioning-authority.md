# Project-root provisioning authority

## Problem

BandScope already rejected Unix symlinks and Windows reparse points when reopening an existing app-local project root, but the new-project path still called `std::fs::create_dir_all` from the Tauri command boundary. That made creation authority weaker than reopen authority: a stable linked app-local base could redirect a newly minted project directory into a different filesystem subtree before local-audio materialization wrote project-owned bytes.

This is a local filesystem authority defect, not a claim of remote arbitrary-file access. It maps to CWE-59 because an intended path can resolve through a link to an unintended resource. Rust documents `create_dir_all` as recursive, non-atomic creation implemented through repeated platform directory-creation calls; it does not provide a no-follow ancestor contract.

## Constraints

- Keep Project Persistence as the owner of project-root authority; do not move Resource Admission source semantics into this module.
- Preserve the already-reviewed macOS `/etc`, `/tmp`, and `/var` root aliases only when they remain root-owned and resolve to the exact `/private/...` system target.
- Do not introduce process-global state, broad filesystem canonicalization as authorization, forceful deletion, or a platform-specific privilege requirement.
- Do not claim descriptor-bound ancestor stability: a component can still be replaced after metadata validation and before the next filesystem operation.

## RED

`834e561263224744f5a1af3c2c3e36d76155c216` adds Unix and Windows regressions requiring a linked/reparse app-local base to fail new-project provisioning without creating the project in the redirected target. `6e235a42dd3096b51a0f26f11dd17a72b772b61e` and `93da927696826149a9f742fbdc630fb74ab4d80a` add the previously missing project-root authority test path to the macOS and Windows owner workflows so this contract is hosted rather than test-file-only evidence.

The RED intentionally names the missing creation-side authority `provision_new_project_root`; compilation/test failure is acceptable evidence at this step because the product had no safe creation primitive to call.

## Fix

`f566951e581d0fcf48ac8c9c806cb5ab5ff9570e` adds creation-side authority in `project_root.rs`:

- validate the minted `project_id` before joining;
- walk the lexical base chain from the filesystem root downward;
- inspect every existing component with `symlink_metadata` and reject Unix symlinks / Windows reparse points, subject only to the existing narrow macOS root-alias exception;
- create each missing base component with single-directory `create_dir`, then immediately verify that component as a real directory;
- create the final project directory with single-directory create semantics and refuse silent reuse of an existing project root.

`066a274015a1b0101d3b2ba0442448e63ca4c4e7` wires the Tauri new-project entry points (`select_local_audio_source` and `import_youtube_url`) to that owner. Existing-project callers now use the existing-root resolver rather than creation semantics. `79eee50e7be4e6bac913f700be938115867261bc` adds the ordinary positive case and verifies that a second new-project provision attempt cannot silently reuse the directory.

## Alternatives rejected

`create_dir_all` followed by validation was rejected because bytes can already be created under a redirected ancestor before the later check. Canonicalizing the base and accepting the canonical target was rejected because that turns redirection into authority rather than rejecting it. Process-wide locking does not prevent another process or local principal from replacing a directory entry. Platform-specific symlink creation privileges are irrelevant to detecting already-present Windows reparse points, so the Windows regression uses a junction fixture.

## Evidence and claim boundary

Primary references:

- MITRE. (2026). *CWE-59: Improper Link Resolution Before File Access (Link Following).* https://cwe.mitre.org/data/definitions/59
- Rust Project Developers. (2026). *std::fs::create_dir_all.* https://doc.rust-lang.org/std/fs/fn.create_dir_all.html

Acceptance requires exact-source Windows and macOS owner workflow GREEN after the Tauri wiring commit; predecessor native results do not transfer. The current fix closes stable linked-ancestor redirection for **new app-local project-root provisioning**. It does not yet prove descriptor-relative no-follow semantics against an ancestor swapped between checks, does not harden cache/temp/scores subdirectories owned by other paths, and is not packaged power-loss evidence.
