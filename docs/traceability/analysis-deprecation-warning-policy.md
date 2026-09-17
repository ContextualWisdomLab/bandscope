# Analysis deprecation-warning policy

Status: Proposed

## Problem

Protected `develop@314ddeae7b775a4957594b599358c8255617eb2e` configured analysis-engine pytest with a repository-wide `ignore::DeprecationWarning`. The same protected tree also suppressed every `DeprecationWarning` attributed to `^audioread` around three production decode paths. Those rules made it impossible to distinguish resolved compatibility churn from a newly introduced deprecated API.

The first repair removed those deprecation suppressions but left module-wide `FutureWarning` ignores for `^audioread` in Temporal Analysis and Separation. Those filters had the same structural defect: category + module with no exact message, upstream cause, or removal condition. They could therefore hide a future audioread compatibility change unrelated to the warning that originally motivated the filter.

A second policy gap remained after those source filters were removed: pytest failed closed on `DeprecationWarning`, but not on `FutureWarning`. Python distinguishes the two by intended audience, not by whether the warning can precede a breaking API change. Leaving `FutureWarning` at default handling would therefore let an end-user-facing compatibility warning appear in CI without making the warning audit gate fail.

The three audio loaders also retained message/module-scoped librosa/Numba ignores. Those exceptions still converted dependency warnings into silence before pytest could observe them, while the branch had no exact-head warning inventory proving that either exception was currently necessary. Keeping a suppression first and asking CI to inventory warnings later is circular: the gate cannot report a warning that production code has already discarded.

The analysis lock resolves `audioread==3.1.0`. Upstream's 3.1.0 history records Python 3.12/3.13 support and replacement of the deprecated `aifc` and `sunau` standard-library modules. librosa 0.11.0 separately documents audioread support itself as deprecated and planned for removal in librosa 1.0. A warning ignore without current execution evidence can outlive the warning that originally motivated it and hide a different warning later.

References:

- Python warnings control: https://docs.python.org/3.13/library/warnings.html
- audioread 3.1.0 README/version history: https://github.com/beetbox/audioread/blob/v3.1.0/README.rst
- librosa 0.11.0 advanced I/O documentation: https://librosa.org/doc/0.11.0/ioformats.html

## Constraints

- Do not change audio decode parameters, supported formats, dependencies, lockfiles, or MIR behavior merely to make warning output quiet.
- Do not turn a warning failure into success by restoring a global ignore, broad module ignore, test exclusion, `noqa`, or gate change.
- A temporary third-party warning suppression requires an observed exact-head warning plus exact category/message/module, upstream cause, and a concrete removal condition. It must not be pre-installed before that evidence exists.
- A Draft branch is not protected product truth. Fresh exact-head tests and cross-platform CI must expose warnings hidden by the previous policy.

## Alternatives considered

### Keep the global pytest ignore

Rejected. It makes all `DeprecationWarning` instances invisible, including BandScope-owned deprecated calls and new dependency regressions.

### Revert to Python's default warning behavior

Rejected for CI. Python's warnings filter can ignore or only display categories depending on defaults and location. The analysis acceptance gate needs an observed `DeprecationWarning` or `FutureWarning` to fail rather than merely appear in logs.

### Keep broad `^audioread` warning filters around decode

Rejected. A category + module filter cannot distinguish one historical compatibility warning from a future unrelated warning in the same package. This applies to both `DeprecationWarning` and `FutureWarning`.

### Keep the existing librosa/Numba warning exceptions until CI proves they are stale

Rejected. Runtime suppression prevents CI from observing the very warning needed to justify, repair, or remove the exception. Without current exact-head evidence, a pre-existing ignore has no testable necessity or removal trigger.

### Fail tests on compatibility warnings and expose loader warnings to the gate

Selected. Unowned `DeprecationWarning` and `FutureWarning` instances become test failures, and the three production audio loaders no longer discard warnings before pytest can classify them. If exact-head execution later proves that an upstream-only warning cannot yet be repaired, a narrow temporary exception can be reintroduced only with the observed warning identity, upstream evidence, regression coverage, and removal condition.

## Implementation evidence

- `c9a996912e73c2a5aa0046f8afec5518c892b2e6`: source-level RED requiring pytest not to hide all deprecations.
- `5093dce9425d94b5dc38b54273e635a42d0648aa`: switch pytest to `error::DeprecationWarning`.
- `7885f89c59d3e4b2296efc2fee0379bb09af33f7`: source-level RED rejecting blanket audioread deprecation filters in Temporal Analysis, Transcription, and Separation.
- `ff57338040adfd42404c8066f2ac932aa3e94e82`, `594ea6de4ebb776e8cd7d41299339299a90d7f1a`, `434baa1bd3e27b8a49d8751334a27ffacb51f830`: remove those production deprecation suppressions without changing decode arguments or dependencies.
- `0364d68200a9822f3df2d722164ab3f1a6d89c07`: preserve the existing `pyproject.toml` final newline after the policy edit.
- `fec1d8e9c4f320dd38a803b81f1310eb1238e563`: extend the source-level policy RED so category + `^audioread` filters without an exact message are rejected for both `DeprecationWarning` and `FutureWarning`.
- `e5197fb25bbb2c5f9ae412e24a14d69f3071753f` and `072ebf5714489d0f840d02a12e0344d37dfe35f4`: remove the remaining blanket audioread `FutureWarning` suppressions from Temporal Analysis and Separation. Transcription had no remaining `FutureWarning` suppression.
- `10b5d28ced09c64f148e3b98b7d924357bc20cd4`: policy RED requiring pytest to fail on unowned `FutureWarning` and forbidding a global future-warning ignore.
- `21bbeedcf913d2bbf46ba6ac9a4d5797469ce565`: add `error::FutureWarning` beside the existing deprecation error policy without changing dependencies or decode behavior.
- `fa7adf40294f25325b60cb5abb7cd8f073cb070b`: source-policy RED requiring the three production audio loaders not to install runtime `ignore` filters before warning evidence exists.
- `505d3e14b4559949b6c9cef97bb5b472ea298ae0`: remove Temporal Analysis' remaining librosa/Numba runtime suppression and its warning plumbing.
- `3d94c2f5c5d57d91ded1bba211429e2af71b1537`: remove Separation's remaining librosa/Numba runtime suppression and inherited warning-filter dependency on Temporal Analysis.

These commits prove the policy/source change only. They do not prove that the complete analysis suite is warning-clean; that requires terminal exact-head execution after this document is committed.

## Risks and effects

A previously non-fatal dependency `FutureWarning` or hidden `DeprecationWarning` may now fail CI. That is an intended diagnostic outcome, not a compatibility claim. The causal response is to inspect the originating package/module/call path, migrate BandScope-owned use, upgrade or change a dependency call path where compatible, or document an exact temporary third-party exception with a removal condition.

Removing the loader suppressions does not change sample rate, mono conversion, duration limits, supported formats, or the librosa call path. It only restores warning observability. The change does not itself remove librosa's deprecated audioread fallback; format-support changes require separate buyer-facing evidence because forcing a new decoder path can alter which real audio files BandScope accepts.

## Follow-up

1. Run the full analysis suite with the fail-on-deprecation/future-warning policy and no loader-side ignores.
2. Record every distinct warning by category, message, originating module/package, and call path.
3. Repair owned deprecated calls and rerun the focused/full suites.
4. For an upstream-only warning that cannot yet be repaired, add no suppression until its exact identity, upstream cause, regression coverage, and removal condition are documented.
5. Keep the PR Draft until exact-head repository/central gates and an independent non-author review are complete.

## Security Notes

### Trust boundary

Dependency/runtime warning output is diagnostic input to the analysis acceptance gate. A suppression rule changes which dependency and owned-code regressions become review-visible evidence.

### Mitigations

The pytest policy fails on both `DeprecationWarning` and `FutureWarning`, and the source-policy regression prevents the three production audio loaders from discarding runtime warnings before the gate observes them. Any future exception requires evidence rather than inheriting a legacy ignore.

### Remaining risk

This policy does not make third-party dependency behavior safe by itself and does not yet prove zero warnings on every supported Windows/macOS runtime. Exact-head hosted execution remains required.
