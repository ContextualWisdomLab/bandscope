# 2026-07-02 Sale Readiness Due Diligence Packet

This packet captures the current evidence needed to move BandScope toward a
20억 KRW sale-readiness discussion. It is not a valuation claim. It is the
repo-controlled checklist for closing the security, release, Figma, and PR
evidence gaps that a strategic buyer or technical diligence reviewer would ask
about first.

## Current Evidence Snapshot

Collected on 2026-07-02 KST from GitHub, Best Practices, Figma/FigJam
metadata, and local repository commands.

| Area | Current evidence | Sale-readiness interpretation |
| --- | --- | --- |
| GitHub repository | `ContextualWisdomLab/bandscope`, public MIT repo, default branch `develop` | Public diligence surface exists. |
| Open PR queue | 34 open PRs. Live 2026-07-03 08:33 KST REST fallback sweep checked every open PR head through `commits/{sha}/check-runs` after GitHub GraphQL rollups returned HTTP 504; it found `0` completed `failure`, `timed_out`, `action_required`, `startup_failure`, or `cancelled` rows. | Queue is routed and no longer blocked by review state or queued checks. Source-backed completed failures and due-diligence evidence gaps are the active execution risk. |
| Dependabot | `0` open alerts after alert #1 (`glib`, Rust, `GHSA-wrw7-89jp-8q8g`, medium) was dismissed on 2026-07-02 as `tolerable_risk` with repo-controlled rationale | GitHub-facing disposition is closed; patched upstream chain is still the preferred final state. |
| Code scanning | Two open Scorecard alerts on `develop`: #30 `VulnerabilitiesID` for `RUSTSEC-2026-0190`, `RUSTSEC-2026-0194`, and `RUSTSEC-2026-0195`; #29 `CIIBestPracticesID` for an `InProgress` badge. Alert #30 still points at the 2026-06-29 Scorecard SARIF and #29 still points at the 2026-06-18 SARIF. | PR #525 merged the `anyhow` fix on 2026-07-02, but the latest published Scorecard run for `develop` predates that merge and the `quick-xml` findings remain controlled exceptions. #30 needs a default-branch Scorecard refresh and either closure or accepted-risk disposition for the remaining owner-chain exceptions. Issue #526 tracks the external OpenSSF badge work for #29. |
| OpenSSF Best Practices | Project `13428`, repo URL `https://github.com/ContextualWisdomLab/bandscope`, `badge_percentage_0=0`, `badge_percentage_1=0`, `badge_percentage_2=0`, `tiered_percentage=0`, `name:null`, `homepage_url:""`, `updated_at=2026-06-29T14:06:03.700Z` | Baseline badge work is a due-diligence blocker outside normal PR-only flow and must be completed in bestpractices.dev before Scorecard #29 can be expected to clear. |
| Figma/FigJam handoff | FigJam board `WEvhutQSFZITe0RUsZgzC2` now records queue, data-room, screenshot, mobile-demo, coverage/package, and #489 restored-evidence checkpoints through section `74:2829` without Code Connect. Figma design file `zthWmqfNKUgJBECvv002Qk` remains the design-system source referenced by `docs/design-system/`. | Live design evidence exists and current Product Design screenshots cover more buyer-demo states, but final sale-readiness still needs packaged-release proof, disabled-state/language polish, and any Figma file drift rechecked before visual PRs merge. |
| Commercial model | `docs/business/bandscope-commercial-model.md` and `docs/business/pilot-evidence-template.md` define the bottom-up ARR path, pilot evidence fields, and redaction rules. | Repo now has commercial evidence structure and local screenshot evidence, but ARR and pilot rows remain `presence-only` until real pilot records and release/export proof exist. |
| JavaScript audit | `npm audit --workspaces --audit-level=high` reports 0 vulnerabilities | JS workspace is not the current high-risk advisory lane. |
| Rust advisory chain | `cargo tree --target all -i glib` resolves `glib 0.18.5` through the Tauri/wry/webkit2gtk/gtk GTK3 stack | Repo-controlled exception and Dependabot disposition now align. |

## Buyer Data Room Evidence Semantics

Buyer data-room files must separate "present in the repository" from "final
evidence passed." A manifest, checklist, screenshot, or packet entry is useful
only if a reviewer can see what validated it and what still remains provisional.

Use these fields when turning this packet into a data-room manifest, release
note, or acquisition audit:

| Field | Meaning | BandScope examples |
| --- | --- | --- |
| `artifact` | The file, workflow artifact, release asset, issue, PR, or FigJam node being offered as evidence. | This packet, SBOM artifacts, OpenSSF project `13428`, buyer-demo screenshots, FigJam board `WEvhutQSFZITe0RUsZgzC2`. |
| `evidenceType` | `presence-only`, `validated`, `accepted-risk`, or `external-blocked`. | A markdown packet is `presence-only` until checks and owner evidence validate it; the `glib` disposition is `accepted-risk`; OpenSSF is `external-blocked` until bestpractices.dev is completed. |
| `validatedBy` | The command, workflow, release verification, issue, or human-owned external record that proves the artifact. | `scripts/checks/verify_supply_chain.py`, `npm audit --workspaces --audit-level=high`, current-head GitHub checks, release artifact manifest checks, issue #526. |
| `validFor` | The diligence question this artifact answers. | Security posture, release reproducibility, design handoff, pilot evidence, transfer readiness, or package-boundary rationale. |
| `openGap` | The concrete missing proof before a buyer can treat it as final evidence. | OpenSSF baseline completion, current-head CI failure closure, Product Design screenshots, or release SBOM/checksum retention. |

Do not mark an item as final evidence just because the file exists. Final
evidence requires a current validation path, a named owner or source of truth,
and an explicit removal or refresh condition for accepted-risk items.

## Commercial KPI And Pilot Evidence Gates

The 20억 KRW discussion depends on proof that BandScope can become a repeatable
local-first rehearsal product, not just a clean repository. Use these KPI gates
to decide whether an artifact supports sale readiness or is still provisional.

| Gate | Target evidence | Validation path | Open gap |
| --- | --- | --- | --- |
| Buyer-demo activation | A new reviewer can complete source selection, analysis start, ready review, and export within 15 minutes. | Product Design screenshots for empty, selected, loading, error, ready, export, and mobile states; local smoke script or recorded demo notes. | Screenshots and demo transcript are still required before claiming final buyer-demo evidence. |
| Analysis value | Ready workspace shows tempo/BPM, role guidance, groove or bass structure, section roadmap, confidence, and priority sections. | Current-head product PRs #489 and #499 plus workspace state tests or screenshots. | Feature PRs must merge and be rechecked on `develop`. |
| Export value | Cue sheet, chart JSON, and handoff JSON are available only from a ready workspace and remain path/URL/secret redacted. | Export tests, Product Design ready/export screenshots, and release artifact evidence. | Final release package evidence must retain SBOM plus checksums or manifest sidecars. |
| Pilot conversion | 3-5 named pilot teams or equivalent buyer personas have a documented rehearsal workflow, pain point, and acceptance note. | `docs/business/pilot-evidence-template.md` records or issue/CRM entry with date, role, workflow, and result. | No completed pilot record is final yet; treat the template as `presence-only` until pilot notes exist. |
| Commercial pacing | ARR path to 3-5억 KRW is backed by a simple bottom-up model: pilot count, conversion rate, annual price, and churn assumption. | `docs/business/bandscope-commercial-model.md` plus validated pilot conversion records. | The model exists, but it is provisional until pilot conversion and pricing evidence validate the assumptions. |

Targets are intentionally operational. If a metric cannot be validated from a
repo artifact, GitHub run, Figma screenshot, or named pilot record, it remains
an open data-room gap rather than a sale-readiness claim.

## PR Execution Tracks

The open PRs should be handled by track, not oldest-first. This table is the
current 34-PR checkpoint after the RustSec policy was propagated to every open
PR head, including the canonical #525 source branch and #523 restored-policy
head `02fe673`.

| Track | Count | First closure target |
| --- | ---: | --- |
| Due diligence governance | 2 | PR #524 sale-readiness packet and issue #526/OpenSSF Best Practices project `13428` |
| Due diligence security | 5 | PR #525 RustSec baseline, #527 project ID path guard, #537 traversal rejection, #538 error sanitization, #531 range parsing hardening |
| Buyer-demo product | 2 | PR #489 BPM display and #499 practice progress |
| Design UX | 3 | PR #528 YouTube URL cap, #529 clear button, #530 disabled nav tooltip/accessibility behavior |
| Quality performance | 5 | PR #367, #401, #482, #506, #523 |
| Quality tests | 6 | PR #395 and #532-#536 analysis/export/pitch/role/section coverage |
| Dependencies | 11 | PR #436, #437, #440-#446, #508, #510, #511 |

Regenerate the detailed PR routing table from the GitHub API before execution
or publication, because the queue is expected to move while this work is in
review. The table above is the 2026-07-02 21:59 KST evidence snapshot, not a
durable source of truth for future queue counts.

Every current open PR head now carries the `anyhow 1.0.103` RustSec update and
the repo-controlled `quick-xml` audit/OSV exception policy, with no inline
quick-xml ignore in `.github/workflows/security-audit.yml`. PR #523 was
repaired again at `02fe673` after bot commit `9413356` reverted the policy
files. Local evidence passed on #523: `scripts/checks/verify_supply_chain.py`,
`cargo audit`, `scripts/checks/security_gates.py`, `npm run check:supply-chain`,
`npm run check:security-notes`, and `git diff --check`; all open heads were
audited through GitHub contents API for the same policy shape.

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
- Evidence exists and is entered in bestpractices.dev for project name,
  description, homepage or justification, license, repository basics,
  contribution process, security reporting, build/test invocation, CI, release
  notes, vulnerability handling, and current documentation.
- Scorecard `CIIBestPracticesID` no longer reports open.

### 3. Buyer-Demo v0.2

- A reviewer can run a 15-minute demo from local audio or YouTube URL through:
  source selection, analysis progress, ready workspace, role review,
  bass transcription or groove map, practice progress, and cue/chart/handoff
  export.
- Empty, loading, error, and ready states are all covered by tests or Product
  Design screenshots.
- Error messages remain path/URL/secret redacted.
- `docs/business/pilot-evidence-template.md` has 3-5 completed pilot records
  or linked issue/CRM equivalents with redaction checks.
- `docs/business/bandscope-commercial-model.md` has current pilot conversion
  assumptions and is marked provisional until real pilot evidence exists.

### 4. Figma Without Code Connect

- Figma Code Connect stays out of scope.
- The Figma file contains the expected handoff pages or their updated names:
  component contract, screen blueprints, workspace state matrix, readiness
  audit, and buyer-demo flow.
- Repo mirrors in `docs/design-system/` match the live Figma metadata and
  screenshots.
- FigJam board `WEvhutQSFZITe0RUsZgzC2` keeps a current security/readiness
  checkpoint section when repo state changes materially.
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

Scorecard alert #30 remains open even after PR #525 merged because the published
Scorecard SARIF still predates the merge and the alert also includes the
repo-controlled `quick-xml` owner-chain exceptions. It must be refreshed on the
default branch and then closed or explicitly dispositioned against the remaining
accepted-risk evidence. Scorecard alert #29 remains open until Best Practices
project `13428` is completed on bestpractices.dev and the Scorecard signal
refreshes.

All 34 open PRs still have review and/or queued-check gates pending at this
checkpoint, but the 2026-07-03 08:33 KST REST fallback sweep found no completed
current-head check-run failures. Treat any new completed current-head DMG
failure as a release-readiness blocker and harden
`.github/workflows/build-baseline.yml` without weakening release artifact
evidence.

### Test Points

- `gh api repos/ContextualWisdomLab/bandscope/dependabot/alerts`
- `gh api repos/ContextualWisdomLab/bandscope/code-scanning/alerts`
- `curl -fsSL https://www.bestpractices.dev/projects/13428.json`
- `cargo tree --target all -i glib`
- `npm audit --workspaces --audit-level=high`
- `python3 scripts/checks/verify_supply_chain.py`
- `docs/business/bandscope-commercial-model.md`
- `docs/business/pilot-evidence-template.md`
- Figma metadata read for file `zthWmqfNKUgJBECvv002Qk`
- FigJam read for board `WEvhutQSFZITe0RUsZgzC2`, section `13:900`

## Next Execution Order

1. Keep polling current-head GitHub checks for all 34 open PRs; fix any new
   completed failure before merging lower-value product or dependency work.
2. Trigger or wait for a default-branch Scorecard refresh after #525's merge to
   confirm `RUSTSEC-2026-0190` is gone from published Scorecard evidence.
3. Complete issue #526 on bestpractices.dev for OpenSSF project `13428`.
4. Keep the `glib` Dependabot disposition evidence current until upstream
   removes or patches the GTK3 chain.
5. Canonicalize the P0 security PRs that touch path traversal, information
   leakage, and command-injection risks.
6. Capture Product Design screenshots for ready, error, export, and mobile
   buyer-demo flows, then mirror any material findings in FigJam without Code
   Connect.
7. Fill the pilot evidence template with 3-5 safely redacted pilot records and
   update the commercial model assumptions from those records.
8. Merge buyer-demo product PRs in the order BPM, practice progress, export,
   then supporting workspace views.
