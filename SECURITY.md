# SECURITY.md

## Scope

BandScope is a local-first desktop app. Treat every file, URL, metadata field,
project file, model artifact, cache entry, and export target as untrusted input.

## Reporting vulnerabilities

- Prefer this repository's GitHub private vulnerability reporting or Security
  Advisory workflow when that feature is enabled:
  [Private security advisory](https://github.com/ContextualWisdomLab/bandscope/security/advisories/new).
- If that private repository feature is unavailable to you, contact the
  ContextualWisdomLab repository maintainers through an established private
  channel. Do not substitute a public issue, pull-request comment, or discussion.
- Never include production credentials, private project material, copyrighted
  model artifacts, or other sensitive data in a public report.
- We expect vulnerability disclosure timelines to follow coordinated practices,
  generally allowing up to 90 days for remediation before public disclosure
  unless severity or an active exploitation situation requires a different
  coordinated plan.
- If private reporting is not enabled, treat repository bootstrap as incomplete
  and resolve that owner-side reporting boundary before public release.

## Source of truth

- App security rules: `docs/security/app-security.md`
- Dependency and SBOM rules: `docs/security/dependency-policy.md`
- Code Security rules: `docs/security/code-security.md`
- SBOM retention rules: `docs/security/sbom-policy.md`
- Cross-platform build rules: `docs/security/cross-platform-build-policy.md`
- Gitflow and bootstrap rules: `docs/repository/gitflow.md`,
  `docs/repository/bootstrap-plan.md`, `docs/repository/governance.md`
- Brand and product voice: `docs/brand-story.md`
- Architecture and repo boundaries: `ARCHITECTURE.md`

## Default rules

- prefer minimum privilege
- fail safely when trust cannot be established
- do not add generic exec, read, or write surfaces
- do not add untrusted HTML to the WebView
- use allowlisted IPC only
- require Security Notes for changes that touch files, URLs, subprocesses, IPC,
  WebView, updates, or model downloads
- require dependency review, audit, SBOM generation, and lockfiles for
  supply-chain changes
- require Windows and macOS build validation for protected-branch and release-path
  changes

## Review triggers

If a change touches any of the following, it must reference
`docs/security/app-security.md` and include `Security Notes` in the plan, design,
or implementation summary:

- file import or export
- URL handling
- subprocesses or native tools
- WebView rendering
- local backend or IPC changes
- model loading or download
- updates, installers, or release delivery
- cache, temp files, logging, telemetry, or crash reporting
