# PR #732 security-baseline reconciliation RCA

## Scope and exact failing evidence

BandScope draft PR #732 at exact head `830dd4c982b12e1dcdf896e3e951363f1ec16a15` was based on `develop@acdbea6344fe1231c39535b575f4de35e4c607c9`, before the canonical JavaScript dependency-security repair landed.

Exact-head `security-audit` run `31964307186`, job `95221704766`, completed checkout and tool setup, installed the committed graph successfully, and then failed `npm audit --workspaces --audit-level=high` on three HIGH dependency classes: `nanoid <3.3.18`, `pdfjs-dist >=5.6.83 <6.2.108`, and `undici 7.0.0-7.28.0`. The aggregate `Security Scan` run `31964307197`, job `95221730550`, independently completed Trivy execution, produced non-empty SARIF, and failed closed on HIGH `CVE-2026-16633` for `pdfjs-dist` at `package-lock.json:6370`; SARIF upload itself succeeded.

This evidence distinguishes the failure from a runner/setup race, network/provider outage, missing permissions, missing scanner output, stale status-only evidence, or an LLM/reviewer availability failure. The checks were correctly rejecting a vulnerable dependency baseline. They must not be bypassed or suppressed.

## Causal owner and cross-repository/dependency inspection

PR #732 changes only chord-recognition Python code, numerical regressions, doctoring, and the changelog relative to its historical base; it does not own the JavaScript dependency graph. The canonical causal owner was the shared BandScope dependency baseline repaired by PR #783, which protected-merged as `7ad56cf0065d068ec6463d92726de4855a6e201d` on 2026-08-25. That repair pins `pdfjs-dist` 6.2.108, `nanoid` 3.3.18 in the resolved graph, `undici` 7.29.0, and the reviewed npm/Corepack lock-generation provenance. Current protected `develop@749511c3ad4000090048718f685c6bee6b3d2c25` contains that repair.

A three-way file-set inspection from the old PR base showed that #732's product delta and the protected-base security repair overlap only in `CHANGELOG.md`; the source, test, dependency, lockfile, and workflow ownership boundaries are disjoint. The changelog is reconciled additively while preserving the protected branch's later correction to the 0.1.4 testing claim.

## Repair

The safe downstream repair is a non-destructive merge of current protected `develop` into the existing #732 branch. This preserves #732's exact chord implementation and tests, inherits the already-reviewed canonical dependency graph instead of duplicating it, and avoids force-push or destructive rebase. No security, review, coverage, provenance, or vulnerability gate is weakened; no status is manufactured; no failing security evidence is treated as passing.

## Verification contract

The merge commit itself is not success evidence. Fresh workflows must bind to the resulting unchanged PR head. In particular, `security-audit` and the aggregate `Security Scan`/`trivy-fs` must complete terminal-success against the inherited patched dependency graph. Queued, skipped, pending, cancelled, predecessor-head, or stale same-head evidence remains non-passing. If a fresh failure appears, its exact job logs must be diagnosed before any further source change.

The repository does not currently contain `docs/product-technical-gap-baseline.md`, so this RCA is recorded in the owning repository's doctoring documentation and `CHANGELOG.md`.