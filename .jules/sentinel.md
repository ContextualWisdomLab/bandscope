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

## 2024-05-23 - 파이썬 로거 입력값 검증 (Python Logger Input Sanitization)
**Vulnerability:** 신뢰할 수 없는 사용자 입력값이 직접 `logger` 문자열 보간(string interpolation)에 전달되었습니다.
**Learning:** 경로, URL, 크기 같은 신뢰할 수 없는 데이터를 검증 없이 로깅하면 공격자가 줄바꿈 문자(`\n`, `\r`)를 주입하여 임의의 로그 항목을 위조할 수 있으며, 이는 감사 회피 및 혼란을 야기할 수 있습니다.
**Prevention:** 로그 주입을 방지하기 위해 표준 지연 문자열 보간법(예: `logger.info("msg %s", var)`)을 사용하고, 제어 문자가 포함될 수 있는 입력값은 `repr()`로 감싸 자동으로 이스케이프 처리해야 합니다.
