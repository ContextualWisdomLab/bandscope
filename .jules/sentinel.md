## 2024-05-18 - CSV Formula Injection whitespace bypass
**Vulnerability:** CSV formula injection mitigation was naive, missing leading whitespace, tabs, and newlines.
**Learning:** Checking `/^[=+\-@]/` is not sufficient, as OWASP states that spaces and tabs before the formula triggers will also execute the formula in applications like Excel.
**Prevention:** Use a regex that allows leading whitespace (e.g. `/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/`) and include standalone tabs or new lines which are also injection vectors.
## 2024-06-24 - Exception Information Leakage via CLI Output
**Vulnerability:** Raw exception objects were caught and directly serialized into standard output via `sys.stdout` upon fallback file reading failure in `services/analysis-engine/src/bandscope_analysis/cli.py`. This exposed internal file paths (e.g., inside `FileNotFoundError`) to the user/client.
**Learning:** `except Exception as e:` blocks that log or format `e` directly into an API/CLI response bypass the application's secure failure boundary. System errors (like file access) contain contextual information such as complete absolute directory paths which should be classified as sensitive internal details.
**Prevention:** Avoid formatting raw `Exception` instances directly into public-facing error envelopes or logs unless they are strictly sanitized or replaced with generic user-friendly messages (e.g. "Failed to read job file. Please ensure the path is correct and accessible.").
