## 2023-06-10 - Caching parsed lockfile results

**Learning:** Parsing Cargo.lock files repeatedly per iteration in the supply chain verification script causes significant I/O and CPU overhead.
**Action:** Use `@functools.lru_cache` to cache parsed package dictionaries based on `Path` inputs for static checks.

## 2024-06-03 - O(1) Map Lookups for Performance

**Learning:** Replacing repeated `Array.prototype.find()` searches (O(N)) with `Map.prototype.get()` (O(1)) provides meaningful performance benefits when lookups occur in critical paths or frequent message handlers.
**Action:** Prefer keyed lookup caches for repeated job or event lookups, while keeping a fallback path for data that may have been initialized before the cache is populated.
