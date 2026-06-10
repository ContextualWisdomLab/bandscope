## 2024-05-18 - Optimize Graph Traversals with Set Operations

**Learning:** Graph traversals like computing reachable ancestors in Python can be severely bottlenecked by maintaining the pending worklist as a list. Using `pop(0)` is O(N) because it shifts all elements, and `extend()` allows duplicate work. Using pure set operations (`pending.pop()`, `pending.update(new_deps - visited)`) changes these paths from O(N) list operations per node to O(1) set operations, massively reducing execution time from ~1s to ~0.04s for 2000 packages.

**Action:** Whenever doing graph traversals or breadth/depth-first searches where the visit order doesn't matter, prioritize pure set operations instead of converting sets back-and-forth to lists. Use `set.pop()` and `set.update(new - visited)` to eliminate duplicate enqueueing and slow shifting operations.
