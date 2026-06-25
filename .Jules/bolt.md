## 2024-05-23 - Short-circuiting iteration for performance gain
**Learning:** In arrays checking for a boundary state (like a "low" priority flag), using `.reduce()` unconditionally iterates the entire collection $O(N)$ times. Replacing this with a `for...of` loop with a `break` creates an early exit $O(1)$ fast-path when the boundary state is encountered.
**Action:** Always prefer loop constructs with `break` when finding min/max values where an absolute bound is known and frequent, avoiding unnecessary array traversals.
