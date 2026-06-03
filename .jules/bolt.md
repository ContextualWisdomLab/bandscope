
## 2024-06-03 - O(1) Map Lookups for Performance

**Learning:** Replacing repeated `Array.prototype.find()` searches (O(N)) with `Map.prototype.get()` (O(1)) provides massive performance benefits, especially when the lookups occur in critical paths or event loops. In this project, it reduced a 10,000-item retry benchmark from ~1400ms down to ~4ms.

**Action:** Always watch out for linear array searches inside tight loops, timeouts, or frequent message handlers, and introduce a `Map` to cache and look up objects by their unique ID.
