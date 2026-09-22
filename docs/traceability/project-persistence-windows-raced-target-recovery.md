# Windows raced-target rollback authority

## Problem

Exact head `40847ed016e4507dd7834808a76f5f1d796695ef` exposed a Windows-only recovery defect in the native Project Persistence owner lane. Run `35414912901`, job `105821531885`, reached the real persistence harness: 46 of 47 tests passed and `overwrite::existing_project_never_clobbers_a_target_swapped_after_authority_snapshot` failed because the rejected candidate stage remained after rollback. The same job also reported the test-only `replace_existing_project_file_with_flush_for_test` wrapper as unused.

The failing state is a legitimate compare-and-swap race, not permission to overwrite the competing file. Project Persistence captures an `expected` identity before staging. If another writer replaces the pathname before `ReplaceFileW`, Windows publishes the staged candidate and stores the file that actually occupied the target at replacement time in the backup path. That displaced object can therefore be a racer whose identity differs from `expected`.

The previous rollback restored that displaced object correctly but then called the identity-bound durability flush with stale `expected` authority. The restored target was the racer, so the flush necessarily failed and conservative cleanup left the candidate stage and recovery journal behind. Prepared crash recovery carried the same assumption: it treated every displaced object as the admitted predecessor, verified migration input against it, and flushed a restored Windows target against `journal.expected` even when the displaced object was a later racer.

## Invariants

`expected` has one role: commit authorization. A replacement may commit only when the displaced object still has the captured expected identity and any migration receipt also validates its exact input bytes. A raced displaced object must never authorize the candidate.

Rollback has a different authority. Once the candidate is rejected, the product must preserve the object that actually occupied the selected pathname at replacement time. Its native identity is therefore the durability authority for the restored target. If that identity cannot be established, recovery remains fail-closed and retains recovery material.

For migration journals, a displaced object is verified as the migration predecessor only when its native identity equals `journal.expected`. A different displaced identity is a concurrent occupant to restore, not migration input to authenticate.

## Repair

Source repair `b4214ad83747f8bbcbb71a8513c9ea155a9b7322` keeps the success gate unchanged: `displaced == expected` is still required before validation and candidate flush can authorize commit. On the rejection path, Windows rollback now flushes the restored target against the exact displaced identity captured from the backup rather than stale `expected` identity.

Prepared recovery follows the same distinction. Migration predecessor verification runs only for a displaced object matching `journal.expected`. Windows restores the actual displaced object and performs the identity-bound flush against that object's identity before candidate, displaced artifact, or journal cleanup. Linux/macOS exchange behavior is unchanged.

The cross-platform competing-file recovery regression now has a Windows branch that models the real `ReplaceFileW` state: the originally admitted project is parked, a racer wins the pathname, the staged candidate replaces the racer into a generated backup, and recovery must restore the racer while leaving the separately parked admitted file untouched. Candidate, displaced backup, and journal cleanup are required only after the restored target reaches the durability boundary.

The unused test-only flush wrapper was removed rather than suppressed. The consolidated harness calls the crate-private production `replace_existing_project_file_with_validation_and_flush` function with explicit `PublicationValidation::IdentityOnly`, so the injected failure exercises the same state machine without a duplicate test API. This is crate-private visibility for the existing owner, not a second public persistence surface.

## Rejected alternatives

Flushing the restored racer against `expected` is rejected because it confuses admission authority with rollback durability authority and makes successful rollback cleanup impossible by construction. Treating a raced displaced object as migration input is rejected because its bytes were never the source of the prepared migration receipt. Deleting recovery material after a failed restored-target flush is rejected because it would turn an unproven rollback into false success. Skipping the Windows regression, accepting leftover artifacts, using `#[allow(dead_code)]`, or weakening the warning gate is also rejected.

## Evidence boundary

The hosted RED proves the prior exact head's Windows rollback/cleanup defect. The source repair proves the causal state-machine change in repository history; it is not itself terminal native evidence. The final descendant must reacquire the warning-gated Windows and macOS Project Persistence lanes on its own exact head. General CI, build-baseline, SBOM, security/SAST, independent review, protected ancestry, Resource Admission #866 integration, packaged process-kill/disk-full/permission/power-loss testing, signing/notarization, and immutable release/updater rollback remain separate gates.
