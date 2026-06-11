## 2026-06-11 - [Inconsistent YouTube URL Validation Regex]
**Vulnerability:** YouTube URL validation in the Python backend used weak `str.startswith` and substring checks for `youtu.be` paths and `v=` query parameters, instead of the strict 11-character alphanumeric regex (`^[A-Za-z0-9_-]{11}$`) used in the TypeScript and Rust layers.
**Learning:** This discrepancy could have allowed path traversal or injection risks if the backend accepted payloads that the frontend wouldn't have normally produced (e.g., `../../../etc/passwd`), especially when feeding these IDs into `yt-dlp`.
**Prevention:** Ensure cross-language consistency for core input validation rules. When enforcing ID constraints, use a single source of truth regex and apply it directly on both the frontend and backend.
