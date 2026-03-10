# SECURITY.md

## Scope

BandScope is a local-first desktop app. Treat every file, URL, metadata field, project file, model artifact, cache entry, and export target as untrusted input.

## Reporting vulnerabilities

- Prefer GitHub private vulnerability reporting or a GitHub Security Advisory draft when the repository has that feature enabled.
- If private reporting is not yet enabled, treat repository bootstrap as incomplete and escalate to the repository owner to enable it before public release.

## Source of truth

- App security rules: `docs/security/app-security.md`
- Dependency and SBOM rules: `docs/security/dependency-policy.md`
- Code Security rules: `docs/security/code-security.md`
- SBOM retention rules: `docs/security/sbom-policy.md`
- Cross-platform build rules: `docs/security/cross-platform-build-policy.md`
- Gitflow and bootstrap rules: `docs/repository/gitflow.md`, `docs/repository/bootstrap-plan.md`, `docs/repository/governance.md`
- Brand and product voice: `docs/brand-story.md`
- Architecture and repo boundaries: `ARCHITECTURE.md`

## Default rules

- prefer minimum privilege
- fail safely when trust cannot be established
- do not add generic exec, read, or write surfaces
- do not add untrusted HTML to the WebView
- use allowlisted IPC only
- require Security Notes for changes that touch files, URLs, subprocesses, IPC, WebView, updates, or model downloads
- require dependency review, audit, SBOM generation, and lockfiles for supply-chain changes
- require Windows and macOS build validation for protected-branch and release-path changes

## Review triggers

If a change touches any of the following, it must reference `docs/security/app-security.md` and include `Security Notes` in the plan, design, or implementation summary:

- file import or export
- URL handling
- subprocesses or native tools
- WebView rendering
- local backend or IPC changes
- model loading or download
- updates, installers, or release delivery
- cache, temp files, logging, telemetry, or crash reporting
