## 2024-05-19 - Replacing JSON.stringify deep cloning with structuredClone

**Learning:** Deep cloning with `JSON.parse(JSON.stringify(obj))` creates significant intermediate string garbage, which can lead to GC spikes and higher memory pressure. While native JSON parsing has very fast paths for tiny objects, `structuredClone` is cleaner, avoids string serialization, and natively handles complex types like Maps, Sets, and Dates.

**Action:** Prefer `structuredClone()` over JSON stringification when deep cloning objects in modern environments.
