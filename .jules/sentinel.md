## 2024-05-18 - CSV Formula Injection whitespace bypass
**Vulnerability:** CSV formula injection mitigation was naive, missing leading whitespace, tabs, and newlines.
**Learning:** Checking `/^[=+\-@]/` is not sufficient, as OWASP states that spaces and tabs before the formula triggers will also execute the formula in applications like Excel.
**Prevention:** Use a regex that allows leading whitespace (e.g. `/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/`) and include standalone tabs or new lines which are also injection vectors.

## 2025-02-28 - [Path Traversal in API Payloads]
**Vulnerability:** Path traversal possible via `cacheRoot` and `tempRoot` fields in the `AnalysisJobRequest` payload sent from the frontend to the analysis engine.
**Learning:** In local desktop applications like BandScope, do not remove `Path.expanduser()` or block absolute paths for user-selected input files, as this breaks legitimate use cases (e.g., resolving `~/` paths). Apply path traversal mitigations (e.g., explicitly rejecting '..' sequences) only to app-managed, restricted directory inputs (like `cacheRoot` and `tempRoot`) provided via the API.
**Prevention:** Explicitly validate directory inputs by checking for directory traversal sequences like `..` by replacing cross-platform slashes and splitting (e.g., `if '..' in path.replace('\\', '/').split('/')`). Ensure thorough unit test coverage mapping out Windows-style and UNIX-style traversal strings.
