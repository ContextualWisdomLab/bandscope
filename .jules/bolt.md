## 2023-06-10 - Caching parsed lockfile results

**Learning:** Parsing Cargo.lock files repeatedly per iteration in the supply chain verification script causes significant I/O and CPU overhead.
**Action:** Use `@functools.lru_cache` to cache parsed package dictionaries based on `Path` inputs for static checks.

## 2024-06-03 - O(1) Map Lookups for Performance

**Learning:** Replacing repeated `Array.prototype.find()` searches (O(N)) with `Map.prototype.get()` (O(1)) provides meaningful performance benefits when lookups occur in critical paths or frequent message handlers.
**Action:** Prefer keyed lookup caches for repeated job or event lookups, while keeping a fallback path for data that may have been initialized before the cache is populated.

## 2024-05-18 - String concatenation optimization

**Learning:** Replacing iterative string concatenation with list accumulation followed by `" ".join(...)` avoids repeated string reallocations in tight loops.
**Action:** Prefer list-builder patterns when folding many strings in repository verification scripts.

## 2024-05-18 - Avoid sequence of stat calls

**Learning:** When checking for multiple potential file extensions in Python on networked/slower file systems, running multiple `os.path.exists()` in a loop creates significant overhead (N round trips).
**Action:** Replace sequential `exists` calls with a single `glob.iglob(glob.escape(base) + ".*")` check coupled with `endswith()`. Use `glob.escape()` to avoid unintended regex expansion of characters like `[]` in directory names.

## 2024-05-24 - RoleExtractor Loop N+1 Performance Optimization

**Learning:** Instantiating dictionaries with repeated heuristic calculation calls inside a loop over many elements causes significant slowdowns.
**Action:** Build mock role definitions once per extraction call and reuse them while constructing section topologies.

## 2024-06-12 - Replacing Array map/find with nested loops
**Learning:** Using `flatMap().find()` iterates all elements and allocates an intermediate array before searching, incurring O(N) allocation cost and GC overhead in React renders.
**Action:** Replace `flatMap().find()` with nested `for...of` loops and early returns to achieve O(1) memory and O(K) early exit time.

## 2026-06-13 - Memoize SongStructure timeline
**Learning:** The SongStructure timeline component renders multiple DOM nodes for sections and re-rendered unnecessarily when the active role state changed in the parent Workspace.
**Action:** Apply React.memo to static presentational components that receive stable props (like sections) but are siblings to highly interactive state (like role filtering).
