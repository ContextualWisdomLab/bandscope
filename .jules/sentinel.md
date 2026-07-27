## 2024-05-18 - CSV Formula Injection whitespace bypass
**Vulnerability:** CSV formula injection mitigation was naive, missing leading whitespace, tabs, and newlines.
**Learning:** Checking `/^[=+\-@]/` is not sufficient, as OWASP states that spaces and tabs before the formula triggers will also execute the formula in applications like Excel.
**Prevention:** Use a regex that allows leading whitespace (e.g. `/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/`) and include standalone tabs or new lines which are also injection vectors.

## 2024-07-07 - Unsanitized Directory Input Paths API Validation
**Vulnerability:** The API logic allowed user-controlled local data directory paths (`cacheRoot` and `tempRoot`) to be directly used without mitigating cross-platform path traversal vulnerabilities.
**Learning:** Checking for '..' sequences in untrusted paths fails to parse cross-platform separators reliably for untrusted inputs (e.g., Windows backslashes on POSIX). Relying solely on `os.sep` or `os.altsep` is inadequate because absolute paths can bypass restrictions if not resolved correctly, or if `os.altsep` is None.
**Prevention:** Manually replace backslashes with forward slashes and split by forward slash (e.g., `if '..' in path.replace('\\', '/').split('/')`) to enforce path traversal protections explicitly for restricted directory inputs provided via the API. Do not block `~` for user-selected input files.

## 2024-05-20 - Python Path Traversal Mitigation bypass
**Vulnerability:** Path traversal detection in Python backend APIs relied solely on checking the input path string or basic parsed parts which might not adequately catch sequences like `..` when intermixed with different path separators.
**Learning:** Using `if ".." in Path(path).parts` incorrectly assumes `Path` parses mixed cross-platform separators reliably for untrusted input, particularly in heterogeneous environments. Instead, explicitly reject directory traversal sequences by replacing `\` with `/` and splitting on `/` to prevent bypassing automated CI vulnerability scanners (like Strix) as explicitly requested in memory.
**Prevention:** Always manually split the target path using both `/` and `\` manually instead of relying solely on `os.sep`, `os.altsep`, or `pathlib.Path.parts`. This ensures cross-platform payloads are reliably blocked even when executed on POSIX runners.

## 2025-06-22 - URL Parsing Length Limit
**Vulnerability:** Unbounded URL inputs at the analysis entry points.
**Learning:** Regular expressions and URL parsers can spend avoidable CPU or memory on oversized attacker-controlled strings.
**Prevention:** Cap URL length to the product-supported maximum before handing user input to regex or URL parsers. This PR enforces the cap at the TypeScript frontend (`apps/desktop/src/lib/analysis.ts`) and the Python engine (`services/analysis-engine/src/bandscope_analysis/youtube.py`). The Rust-side duplicate cap is deferred to a follow-up (same blocker as PR #527): the org review contract cannot currently evaluate Rust changes, so the diff intentionally touches no `.rs` files. Defense-in-depth is preserved by the TS entry point and the Python engine validation.

## 2026-07-02 - Project ID path traversal guard
**Vulnerability:** Any project identifier that can reach a filesystem path join must be treated as untrusted, even when it is generated internally or passed through IPC lookup flows.
**Learning:** Reject only dangerous path segments (`.` and `..`) and path separators (`/` and `\`) so the guard blocks traversal without rejecting ordinary identifiers such as `my..id`.
**Prevention:** Keep project ID validation centralized before `base_root.join(project_id)`, and cover forward-slash, backslash, parent-component, and benign interior-dot cases in unit tests.

## 2025-02-09 - Ensure Maximum URL Length Limit on Backend

**Vulnerability:** The Rust backend (`apps/desktop/src-tauri/src/main.rs`) did not enforce a maximum URL length limit when processing YouTube URLs via `import_youtube_url`. While the frontend enforced `MAX_YOUTUBE_URL_LENGTH = 2000` via the input element, this could be bypassed by an attacker sending requests directly to the Tauri backend API, potentially causing a Denial of Service (DoS) due to unbounded URL parsing and regex matching.
**Learning:** Input validation must occur at the entry point of untrusted data on the backend, even if it is also validated on the frontend. Relying solely on frontend validation for constraints like string length can expose the backend to resource exhaustion vulnerabilities.
**Prevention:** Always enforce constraints like maximum length, format validation, and sanitization at the earliest possible point on the backend, typically at the API boundary, regardless of frontend safeguards.

## 2026-07-03 - Project ID API Validation
**Vulnerability:** Similar to the previous entry, the `projectId` provided via the API payload was not explicitly validated against path traversal before being used in path concatenations.
**Learning:** Any identifier (such as `projectId`) provided via API payloads that eventually reaches a filesystem path join must be treated as untrusted.
**Prevention:** Apply explicit path traversal protections by rejecting exact string matches for `.` and `..`, as well as any path separators `/` and `\`, but allow normal identifiers with interior dots (e.g., `my..id`) to pass validation safely. Always log security warnings when invalid access attempts are detected.
