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

## 2026-06-29 - 루프 내 불필요한 배열 생성 및 .map() 체인 제거
**Learning:** 루프 내에서 데이터를 직렬화하기 위해 `[a, b, c].map(fn).join(',')` 패턴을 사용하면 반복마다 불필요한 중간 배열 객체들이 힙에 할당되어 가비지 컬렉션(GC) 부하를 심각하게 증가시킵니다.
**Action:** 핫 패스 루프나 직렬화 과정에서는 템플릿 리터럴을 통해 직접 함수를 호출하여 중간 배열 생성을 방지하고 O(1) 메모리 할당으로 최적화하세요.
