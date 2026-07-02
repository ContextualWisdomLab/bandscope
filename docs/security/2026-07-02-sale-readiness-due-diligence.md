# 2026-07-02 Sale Readiness Due Diligence Packet

This packet captures the current evidence needed to move BandScope toward a
20억 KRW sale-readiness discussion. It is not a valuation claim. It is the
repo-controlled checklist for closing the security, release, Figma, and PR
evidence gaps that a strategic buyer or technical diligence reviewer would ask
about first.

## Current Evidence Snapshot

Collected on 2026-07-02 KST from GitHub, Best Practices, Figma metadata, and
local repository commands.

| Area | Current evidence | Sale-readiness interpretation |
| --- | --- | --- |
| GitHub repository | `ContextualWisdomLab/bandscope`, public MIT repo, default branch `develop` | Public diligence surface exists. |
| Open PR queue | 62 open PRs from GitHub REST API after closing superseded PR #502 and opening PR #524/#525 | Queue needs product/security routing; review process is not a blocker. |
| Dependabot | Alert #1: `glib`, Rust, `GHSA-wrw7-89jp-8q8g`, medium; dismissed on 2026-07-02 as `tolerable_risk` with repo-controlled rationale | GitHub-facing disposition is closed; patched upstream chain is still the preferred final state. |
| Code scanning | Two open Scorecard alerts: #30 `VulnerabilitiesID` high for `RUSTSEC-2026-0190`, and #29 `CIIBestPracticesID` low | PR #525 addresses #30; issue #526 tracks the external OpenSSF badge work for #29. |
| OpenSSF Best Practices | Project `13428`, repo URL `https://github.com/ContextualWisdomLab/bandscope`, baseline `0`, passing `Unmet`, silver `Unmet`; issue #526 tracks completion | Baseline badge work is a due-diligence blocker outside normal PR-only flow. |
| Figma handoff | Figma file `zthWmqfNKUgJBECvv002Qk` currently exposes only top-level page `00 Cover` via metadata | Repo handoff docs and actual Figma content are inconsistent. |
| JavaScript audit | `npm audit --workspaces --audit-level=high` reports 0 vulnerabilities | JS workspace is not the current high-risk advisory lane. |
| Rust advisory chain | `cargo tree --target all -i glib` resolves `glib 0.18.5` through the Tauri/wry/webkit2gtk/gtk GTK3 stack | Repo-controlled exception and Dependabot disposition now align. |

## PR Execution Tracks

The open PRs should be handled by track, not oldest-first. This table started
from the 61-PR snapshot and must be regenerated before batch execution.

| Track | Count | First closure target |
| --- | ---: | --- |
| Due diligence governance | 1 | Issue #526, OpenSSF Best Practices project `13428` |
| Due diligence security | 15 | Canonicalize path traversal, information leakage, DoS, and command-injection PRs |
| Buyer-demo product | 6 | PR #483 transcription, PR #499 practice progress, PR #481 export |
| Design UX | 8 | YouTube input safety and disabled-state clarity after Figma state matrix repair |
| Quality performance | 12 | PR #401 YouTube import reliability before cosmetic render micro-optimizations |
| Quality tests | 7 | Analysis-engine and workspace tests that support buyer-demo claims |
| Dependencies | 12 | Build/security dependency bumps before UI-only bumps |

Regenerate the detailed PR routing table from the GitHub API before execution
or publication, because the queue is expected to move while this work is in
review. The table above is the 2026-07-02 evidence snapshot, not a durable
source of truth for future queue counts.

## Closure Criteria

### 1. Security And Supply Chain

- Dependabot open alerts: `0`, or every remaining alert has a repo-controlled
  exception with advisory ID, owner chain, exploitability rationale,
  compensating controls, and removal trigger.
- Code scanning open alerts: `0`, or every remaining alert has explicit
  accepted-risk evidence.
- `scripts/checks/verify_supply_chain.py` passes.
- `npm audit --workspaces --audit-level=high` passes.
- Cargo audit/OSV exceptions remain encoded in:
  - `apps/desktop/src-tauri/.cargo/audit.toml`
  - `apps/desktop/src-tauri/osv-scanner.toml`
  - `docs/security/dependency-policy.md`
  - `scripts/checks/verify_supply_chain.py`

### 2. OpenSSF Best Practices

- Best Practices project `13428` reaches baseline 100%.
- Issue #526 closes with external Best Practices evidence; PR #502 stays closed
  unless replaced by a non-duplicate workflow or documentation change.
- Evidence exists for repository basics, license, contribution process,
  security reporting, build/test invocation, CI, release notes, vulnerability
  handling, and current documentation.
- Scorecard `CIIBestPracticesID` no longer reports open.

### 3. Buyer-Demo v0.2

- A reviewer can run a 15-minute demo from local audio or YouTube URL through:
  source selection, analysis progress, ready workspace, role review,
  bass transcription or groove map, practice progress, and cue/chart/handoff
  export.
- Empty, loading, error, and ready states are all covered by tests or Product
  Design screenshots.
- Error messages remain path/URL/secret redacted.

### 4. Figma Without Code Connect

- Figma Code Connect stays out of scope.
- The Figma file contains the expected handoff pages or their updated names:
  component contract, screen blueprints, workspace state matrix, readiness
  audit, and buyer-demo flow.
- Repo mirrors in `docs/design-system/` match the live Figma metadata and
  screenshots.
- If Figma remains inaccessible or stale, the release notes call that out as a
  design-resource gap rather than claiming visual parity.

### 5. Package Boundary

- Keep monorepo first.
- Stabilize `services/analysis-engine` as the `bandscope-analysis` Python
  package API.
- Stabilize `packages/shared-types` as the runtime schema contract.
- Split a repo, package, subtree, or submodule only when an external SDK,
  different license boundary, or distinct release cadence appears.

## Security Notes

### Attack Surface

This packet covers repository security posture, dependency advisories, Figma
handoff accuracy, PR queue handling, release evidence, local file intake,
YouTube URL intake, subprocess analysis, cache/temp storage, and export
behavior.

### Trust Boundary

Relevant boundaries are the GitHub repository and security alerts, the Rust
Tauri/wry/webkit2gtk dependency graph, Figma design metadata, local user audio
files, remote YouTube metadata, native subprocess execution, app-owned
cache/temp roots, and exported cue/chart/handoff files.

### Realistic Threats

- A buyer or security reviewer treats open GitHub alerts as unresolved risk.
- A vulnerable dependency is dismissed without a clear owner chain and removal
  trigger.
- Figma handoff docs claim implementation guidance that is not present in the
  accessible Figma file.
- PR queue churn mixes security fixes with unrelated feature or UI changes.
- Error, log, or export paths leak local paths, URLs, secrets, or untrusted
  metadata.

### Mitigations

- Keep vulnerability exceptions in repo-controlled config and documentation.
- Re-check GitHub Dependabot and code-scanning alerts before every sale-readiness
  claim.
- Process security and OpenSSF PRs before buyer-demo feature PRs.
- Preserve narrow URL/file/subprocess allowlists from `docs/security/app-security.md`.
- Keep Figma Code Connect out of CI and use Figma only as editable design and
  audit evidence.

### Remaining Risk

The `glib 0.18.5` advisory remains in the Rust dependency graph even though
Dependabot alert #1 is dismissed as `tolerable_risk`. That disposition is
acceptable only while the owner chain remains limited to the Tauri/wry/
webkit2gtk/gtk GTK3 stack and `scripts/checks/verify_supply_chain.py` keeps
guarding the exception scope. The final sale-readiness target is still a
patched upstream chain.

Scorecard alert #30 remains open until PR #525 merges and Scorecard reruns on
`develop`. Scorecard alert #29 remains open until Best Practices project
`13428` is completed on bestpractices.dev and the Scorecard signal refreshes.

### Test Points

- `gh api repos/ContextualWisdomLab/bandscope/dependabot/alerts`
- `gh api repos/ContextualWisdomLab/bandscope/code-scanning/alerts`
- `curl -fsSL https://www.bestpractices.dev/projects/13428.json`
- `cargo tree --target all -i glib`
- `npm audit --workspaces --audit-level=high`
- `python3 scripts/checks/verify_supply_chain.py`
- Figma metadata read for file `zthWmqfNKUgJBECvv002Qk`

## Next Execution Order

1. Merge PR #525 after checks pass to remove `RUSTSEC-2026-0190`.
2. Complete issue #526 on bestpractices.dev for OpenSSF project `13428`.
3. Keep the `glib` Dependabot disposition evidence current until upstream
   removes or patches the GTK3 chain.
4. Canonicalize the P0 security PRs that touch path traversal, information
   leakage, and command-injection risks.
5. Restore Figma handoff pages before merging broad UX tooltip/state PRs.
6. Merge buyer-demo product PRs in the order transcription, practice progress,
   export, then supporting workspace views.
