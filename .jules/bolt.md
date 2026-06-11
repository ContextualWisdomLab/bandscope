## 2023-06-10 - Caching parsed lockfile results

**Learning:** Parsing Cargo.lock files repeatedly per iteration in the supply chain verification script causes significant I/O and CPU overhead.
**Action:** Use `@functools.lru_cache` to cache parsed package dictionaries based on `Path` inputs for static checks.
