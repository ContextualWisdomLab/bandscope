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

## 2025-02-13 - O(1) activeRoleDetails Lookup Optimization
**Learning:** Recomputing active role details by looping through sections and roles on every render/selection causes repeated O(totalRoles) scans.
**Action:** Use a memoized Map cache mapping role ID to the full RehearsalRole object to allow O(1) lookups.
## 2025-02-14 - Replace Set with Map.map with for loop
**Learning:** Using `new Set(array.map(...))` creates an unnecessary intermediate array which wastes memory allocation and garbage collection time, particularly for frequent renders of large transcription arrays.
**Action:** Replace `array.map()` inside `new Set()` with a `for...of` loop or `.reduce()` to iterate and add elements directly to the Set for O(1) memory and avoiding intermediate array allocations.

## 2025-02-15 - Replace Array.from(map.values()).map with a for...of loop
**Learning:** Using `Array.from(map.values()).map(...)` creates an unnecessary intermediate array which wastes memory allocation and garbage collection time, particularly for frequently re-rendered components handling large collections.
**Action:** Use a `for...of` loop over `map.values()` to iterate and push mapped elements directly into the final array for O(1) memory and avoiding intermediate array allocations.

## 2026-07-09 - [Array density check optimization]
**Learning:** [Using Array.from().every() to check for array density creates O(N) intermediate array allocations which add unnecessary garbage collection overhead on the critical path.]
**Action:** [Use a standard for-loop with an early return (i in value) for an O(1) memory and faster check.]

## 2026-07-08 - Vectorize SSM novelty extraction
**Learning:** Extracting checkerboard kernel responses one diagonal window at a time repeats Python slicing and summation overhead for every SSM frame.
**Action:** Sum each checkerboard offset across the full valid diagonal with `np.diagonal(...)`, and keep a loop-reference parity test so boundary scoring stays numerically stable.

## 2026-03-12 - O(1) early exit for confidence level
**Learning:** Using `.reduce()` unconditionally iterates over the entire array for operations with an absolute bound (e.g. finding if there's any 'low' confidence section).
**Action:** Replace unconditional `.reduce()` with a `for...of` loop and early `break` to short-circuit upon finding the minimum possible bound, changing O(N) worst-case into an O(K) best-case execution, yielding measurable performance gains on large documents.

## 2024-07-12 - Vectorize Python nested loops in dynamic programming
**Learning:** Inner loops over state dimensions in Viterbi decoding are extremely slow in pure Python.
**Action:** Use NumPy broadcasting (e.g. `viterbi[:, t - 1, np.newaxis] + log_trans`) to vectorize the inner loop, converting O(N*M) Python loops into O(N) Python loops with fast C-level operations.

## 2026-07-13 - Array.from mapping optimization
**Learning:** Using `Array.from({ length: N }).map(...)` creates an intermediate array of `undefined` values which requires memory allocation and garbage collection, adding O(N) unnecessary overhead in frequently re-rendered UI components.
**Action:** Use `Array.from({ length: N }, (_, index) => ...)` to map elements directly during array creation, avoiding intermediate allocations.

## 2026-08-14 - Vectorize checkerboard kernel using sliding_window_view and einsum
**Learning:** Using nested loops over a window alongside Python array slicing (`np.diagonal`) in tight inner loops adds significant O(K^2) overhead to matrix convolution steps, scaling linearly with audio length. Also, the number of valid diagonal positions is exacty `n - kernel_size + 1` for a `kernel_size`, so using `n - 2 * (kernel_size // 2)` drops the last matrix frame on even kernel sizes and leads to out-of-bounds mismatches.
**Action:** Replace nested loops performing sliding window element-wise multiplication with NumPy's vectorized `sliding_window_view`, extracting elements across dimensions using `np.diagonal`, and performing batched element-wise products via `np.einsum`. Always bound outputs using `valid_length = n - kernel_size + 1`.
