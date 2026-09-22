# BandScope Architecture Overview

## Product shape

BandScope is a local-first desktop app with a React + Tauri shell, shared TypeScript contracts, and a Python analysis service.

It is technically defined as a rehearsal-analysis product, not a single-output chord detector.

## Core rehearsal artifacts

- likely harmony by section and by role
- section roadmap with entries, dropouts, pickups, stops, and handoffs
- groove and timing cues
- role ranges, overlap warnings, and simplification guidance
- transposition, capo, tuning, or setup cues where relevant
- role-specific confidence and rehearsal priority

## Shared domain contracts

- Shared contracts must support a `song -> section -> role` model.
- Roles can include instruments, vocal roles, or hand-specific subdivisions when the arrangement exposes them clearly.
- Contracts should preserve user edits, provenance, and confidence so UI and exports stay aligned with the same domain model.

## Exported rehearsal deliverables

- BandScope should support cue-sheet or chart-style outputs derived from the same section and role model.
- Exported artifacts should stay compact and rehearsal-friendly rather than becoming DAW sessions or engraved scores.

## Delivery flow

GitHub is the source of truth for repository governance, PR review, CI/CD, Code Security, dependency review, SBOM retention, and release distribution.

## Local-first principle

- prefer local processing for audio and analysis
- keep risky capabilities narrow, allowlisted, and explicit
- treat files, URLs, models, caches, and release artifacts as untrusted inputs
- route orchestration through typed Tauri IPC and a narrow Python subprocess bridge before considering any loopback HTTP surface
- keep every renderer-visible command synchronized across the Tauri invoke handler, `AppManifest::commands`, generated command permission, and window capability; do not expose PIDs or generic process handles to the WebView
- validate selected local-audio metadata and encoded size before decode, then stage admitted bytes into the app-owned project and commit a no-clobber immutable source with a path-free size/SHA-256 receipt
- before Python decoders transform source audio, preflight the already-open container handle through the shared `audio_resource_policy` source-rate/channel/duration contract, then rewind it for decoding
- keep project and temp/cache bootstrap roots under Tauri-resolved app-owned directories rather than the shared OS temp namespace
- treat analysis/import subprocess containment as a GUI-independent desktop-core boundary: Linux/macOS establish an owned process group before `exec`, group termination covers timeout/cancellation/error and residual same-group descendants after direct-parent terminal status before output-reader joins; descendants that deliberately leave the group remain outside the claim, and Windows remains direct-child-only until a race-free Job Object boundary is implemented
- keep process containment distinct from resource acceptance: inherited-handle/temp cleanup, cancellation latency, decoder/resampler/downstream peak RSS/VRAM, and explicit per-job CPU/GPU budgets require rights-cleared full-length real-audio evidence

## CI/CD and release flow

- PRs into `develop` and `main` run repository CI, SBOM, and platform builds alongside organization-required OSV, dependency-review, Trivy, CodeQL/code-quality, Semgrep SAST, Strix, and Noema evidence; consolidated local security backstops run after trusted-branch pushes
- release flows publish desktop artifacts plus SBOM evidence to GitHub Releases through a tag-driven draft-before-publish path
- branch protection connects stable required checks after bootstrap workflows exist
