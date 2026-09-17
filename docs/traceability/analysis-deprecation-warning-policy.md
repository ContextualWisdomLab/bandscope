# Analysis deprecation-warning policy

Status: Proposed

## Problem

Protected `develop@314ddeae7b775a4957594b599358c8255617eb2e` configured analysis-engine pytest with a repository-wide `ignore::DeprecationWarning`. The same protected tree also suppressed every `DeprecationWarning` attributed to `^audioread` around three production decode paths. Those rules made it impossible to distinguish resolved compatibility churn from a newly introduced deprecated API.

The first repair removed those deprecation suppressions but left module-wide `FutureWarning` ignores for `^audioread` in Temporal Analysis and Separation. Those filters had the same structural defect: category + module with no exact message, upstream cause, or removal condition. They could therefore hide a future audioread compatibility change unrelated to the warning that originally motivated the filter.

The analysis lock resolves `audioread==3.1.0`. Upstream's 3.1.0 history records Python 3.12/3.13 support and replacement of the deprecated `aifc` and `sunau` standard-library modules. librosa 0.11.0 separately documents audioread support itself as deprecated and planned for removal in librosa 1.0. A module-wide ignore therefore has no defensible removal condition: it can outlive the warning that originally motivated it and hide a different warning later.

References:

- audioread 3.1.0 README/version history: https://github.com/beetbox/audioread/blob/v3.1.0/README.rst
- librosa 0.11.0 advanced I/O documentation: https://librosa.org/doc/0.11.0/ioformats.html

## Constraints

- Do not change audio decode parameters, supported formats, dependencies, lockfiles, or MIR behavior merely to make warning output quiet.
- Do not turn a warning failure into success by restoring a global ignore, broad module ignore, test exclusion, `noqa`, or gate change.
- Third-party warnings may be suppressed only when the exact category/message/module and upstream cause are known and there is a concrete removal condition.
- A Draft branch is not protected product truth. Fresh exact-head tests and cross-platform CI must expose any warning hidden by the previous policy.

## Alternatives considered

### Keep the global pytest ignore

Rejected. It makes all `DeprecationWarning` instances invisible, including BandScope-owned deprecated calls and new dependency regressions.

### Revert to Python's default warning behavior

Rejected for CI. Default filtering can hide repeated or location-dependent deprecations and does not provide a fail-closed acceptance gate.

### Keep broad `^audioread` warning filters around decode

Rejected. A category + module filter cannot distinguish one historical compatibility warning from a future unrelated warning in the same package. This applies to both `DeprecationWarning` and `FutureWarning`. If a temporary third-party exception is required, it must also bind the exact message and carry upstream/removal evidence.

### Fail tests on deprecations and remove the broad runtime filters

Selected. Unowned deprecations become test failures. Known third-party exceptions, if still needed after execution, must be narrower than the removed rules and carry upstream/removal evidence.

## Implementation evidence

- `c9a996912e73c2a5aa0046f8afec5518c892b2e6`: source-level RED requiring pytest not to hide all deprecations.
- `5093dce9425d94b5dc38b54273e635a42d0648aa`: switch pytest to `error::DeprecationWarning`.
- `7885f89c59d3e4b2296efc2fee0379bb09af33f7`: source-level RED rejecting blanket audioread deprecation filters in Temporal Analysis, Transcription, and Separation.
- `ff57338040adfd42404c8066f2ac932aa3e94e82`, `594ea6de4ebb776e8cd7d41299339299a90d7f1a`, `434baa1bd3e27b8a49d8751334a27ffacb51f830`: remove those production deprecation suppressions without changing decode arguments or dependencies.
- `0364d68200a9822f3df2d722164ab3f1a6d89c07`: preserve the existing `pyproject.toml` final newline after the policy edit.
- `fec1d8e9c4f320dd38a803b81f1310eb1238e563`: extend the source-level policy RED so category + `^audioread` filters without an exact message are rejected for both `DeprecationWarning` and `FutureWarning`.
- `e5197fb25bbb2c5f9ae412e24a14d69f3071753f` and `072ebf5714489d0f840d02a12e0344d37dfe35f4`: remove the remaining blanket audioread `FutureWarning` suppressions from Temporal Analysis and Separation. Transcription had no remaining `FutureWarning` suppression.

These commits prove the policy/source change only. They do not prove that the complete analysis suite is warning-clean; that requires terminal exact-head execution after this document is committed.

## Risks and effects

A previously hidden dependency warning may now become visible, and an unowned deprecation may fail CI. That is an intended diagnostic outcome, not a compatibility claim. The causal response is to inspect the originating package/module/call path, migrate BandScope-owned use, upgrade or change a dependency call path where compatible, or document an exact temporary third-party exception with a removal condition.

The change does not itself remove librosa's deprecated audioread fallback. Format-support changes require separate buyer-facing evidence because forcing a new decoder path can alter which real audio files BandScope accepts.

## Follow-up

1. Run the full analysis suite with the new fail-on-deprecation policy.
2. Record every distinct warning by category, message, originating module/package, and call path.
3. Repair owned deprecated calls and rerun the focused/full suites.
4. Audit the remaining message/module-scoped librosa/Numba compatibility filters against the observed warning inventory and retain one only with an upstream cause and concrete removal condition.
5. Keep the PR Draft until exact-head repository/central gates and an independent non-author review are complete.

## Security Notes

### Trust boundary

Dependency/runtime warning output is diagnostic input to the analysis acceptance gate. A suppression rule changes which dependency and owned-code regressions become review-visible evidence.

### Mitigations

The pytest policy fails on deprecations by default, and the source-policy regression rejects module-wide audioread ignores for both deprecation and future-warning categories when no exact message is supplied. Any future exception must be narrower and evidence-backed rather than restoring a removed blanket rule.

### Remaining risk

This policy does not make third-party dependency behavior safe by itself and does not yet prove zero warnings on every supported Windows/macOS runtime. Exact-head hosted execution remains required.
