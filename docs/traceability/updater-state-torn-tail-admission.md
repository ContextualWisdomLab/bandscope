# Updater highest-seen torn-tail admission

## Decision

BandScope treats a non-newline-terminated highest-seen state tail as recoverable only when every byte can still be extended into a release record that `distribution-core::StableVersion` can admit.

The state owner therefore applies the same `u64` component bound used by the canonical stable-version parser while checking an incomplete `MAJOR.MINOR.PATCH` prefix. A decimal component that already exceeds `u64::MAX` is corruption, not a recoverable torn write, even when it is only 20 digits long.

## Problem

`distribution-state` intentionally distinguishes a recoverable final torn append from committed-state corruption. Before this repair, `is_version_prefix()` checked digit/dot grammar, component count, leading zeroes, and a 20-character component ceiling, but did not verify that a non-empty component could fit the `u64` representation owned by `distribution-core`.

That admitted impossible prefixes such as `v1|18446744073709551616` as recoverable. `load_highest_seen()` could consequently return `Ok(None)` (or the previous committed identity when a valid record preceded the tail), and the next writer could truncate the impossible tail as crash residue. Because `18446744073709551616` can never become a valid `StableVersion` component, silently repairing it would discard corruption rather than complete an interrupted valid record.

## RED evidence

Commit `e57864425816959910950052c3f9e40a7cadb8a4` adds `apps/desktop/distribution-state/tests/impossible_torn_tail.rs`.

The regression contract covers overflow in each stable-version component:

- `v1|18446744073709551616`
- `v1|1.18446744073709551616`
- `v1|1.2.18446744073709551616`

All must return `StateError::Corrupt`. The same test preserves two positive boundaries: `v1|2.0` remains a recoverable partial version, and `v1|18446744073709551615` remains recoverable because the component is exactly `u64::MAX` and can still be extended with the remaining separators/components.

## Causal fix

Commit `e793d0018db3cc58a0c929485e9fccc8072bd57a` adds one condition to the existing version-prefix admission loop: every non-empty decimal component must parse as `u64`.

This keeps the repair in the durable-state owner and reuses the representation already established by `distribution-core`; it does not introduce another SemVer implementation or widen the accepted release grammar.

## Alternatives considered

A 20-digit length check alone was rejected because the decimal range `18446744073709551616..=99999999999999999999` is 20 digits but outside `u64` and can never become valid by appending more bytes.

Treating every non-newline tail as recoverable was rejected because it converts arbitrary state corruption into destructive truncation and weakens anti-replay evidence.

Calling the complete `StableVersion::parse()` directly was rejected for incomplete forms such as `2.0`, which are intentionally valid crash prefixes but are not complete `MAJOR.MINOR.PATCH` values. Prefix admission therefore remains a separate state-format concern while sharing the canonical numeric bound.

## Claim boundary

This repair proves only that an incomplete state tail classified as recoverable is numerically extendable within BandScope's current `u64` stable-version representation. It does not authenticate state bytes, make advisory leases mandatory for non-cooperating processes, or prove packaged process-kill/power-loss behavior.

The production trust order remains unchanged: authenticated updater metadata and release identity, verified updater artifact signature, exact sealed-descriptor digest/size binding, explicit verified-artifact promotion, anti-replay decision, then durable highest-seen mutation.

## Follow-up

Keep the new regression in the exact-head Rust test gate. Packaged Windows/macOS acceptance must still cover process kill, restart, power loss, competing-process lease behavior, and last-known-good rollback after the production updater flow is wired.
