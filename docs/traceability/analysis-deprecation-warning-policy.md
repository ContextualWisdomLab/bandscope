# Analysis deprecation-warning policy

Status: Proposed

## Problem

Protected `develop@314ddeae7b775a4957594b599358c8255617eb2e` configured analysis-engine pytest with a repository-wide `ignore::DeprecationWarning`. The same protected tree also suppressed every `DeprecationWarning` attributed to `^audioread` around three production decode paths. Those rules made it impossible to distinguish resolved compatibility churn from a newly introduced deprecated API.

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

### Keep broad `^audioread` deprecation filters only around decode

Rejected. The filter is keyed only by module and category, so it cannot distinguish the historical Python-compatibility warning from a future unrelated audioread deprecation. The locked audioread version has already replaced the deprecated stdlib modules that motivated the old compatibility class.

### Fail tests on deprecations and remove the broad runtime filters

Selected. Unowned deprecations become test failures. Known third-party exceptions, if still needed after execution, must be narrower than the removed rules and carry upstream/removal evidence.

## Implementation evidence

- `c9a996912e73c2a5aa0046f8afec5518c892b2e6`: source-level RED requiring pytest not to hide all deprecations.
- `5093dce9425d94b5dc38b54273e635a42d0648aa`: switch pytest to `error::DeprecationWarning`.
- `7885f89c59d3e4b2296efc2fee0379bb09af33f7`: source-level RED rejecting blanket audioread deprecation filters in Temporal Analysis, Transcription, and Separation.
- `ff57338040adfd42404c8066f2ac932aa3e94e82`, `594ea6de4ebb776e8cd7d41299339299a90d7f1a`, `434baa1bd3e27b8a49d8751334a27ffacb51f830`: remove those production suppressions without changing decode arguments or dependencies.
- `0364d68200a9822f3df2d722164ab3f1a6d89c07`: preserve the existing `pyproject.toml` final newline after the policy edit.

These commits prove the policy/source change only. They do not prove that the complete analysis suite is warning-clean; that requires terminal exact-head execution after this document is committed.

## Risks and effects

A previously hidden dependency deprecation may now fail CI. That is an intended diagnostic outcome, not a compatibility claim. The causal response is to inspect the originating package/module/call path, migrate BandScope-owned use, upgrade or change a dependency call path where compatible, or document an exact temporary third-party exception with a removal condition.

The change does not itself remove librosa's deprecated audioread fallback. Format-support changes require separate buyer-facing evidence because forcing a new decoder path can alter which real audio files BandScope accepts.

## Follow-up

1. Run the full analysis suite with the new fail-on-deprecation policy.
2. Record every distinct warning by category, message, originating module/package, and call path.
3. Repair owned deprecated calls and rerun the focused/full suites.
4. Audit the remaining `FutureWarning` and message/module-scoped compatibility filters separately; do not treat their existence on protected `develop` as permanent acceptance.
5. Keep the PR Draft until exact-head repository/central gates and an independent non-author review are complete.

## Security Notes

### Trust boundary

Dependency/runtime warning output is diagnostic input to the analysis acceptance gate. A suppression rule changes which dependency and owned-code regressions become review-visible evidence.

### Mitigations

The pytest policy fails on deprecations by default, and a regression test rejects the known module-wide audioread deprecation filters in production audio loaders. Any future exception must be narrower and evidence-backed rather than restoring the removed blanket rules.

### Remaining risk

This policy does not make third-party dependency behavior safe by itself and does not yet prove zero warnings on every supported Windows/macOS runtime. Exact-head hosted execution remains required.
