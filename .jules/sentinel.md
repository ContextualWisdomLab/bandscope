## 2024-05-18 - CSV Formula Injection whitespace bypass
**Vulnerability:** CSV formula injection mitigation was naive, missing leading whitespace, tabs, and newlines.
**Learning:** Checking `/^[=+\-@]/` is not sufficient, as OWASP states that spaces and tabs before the formula triggers will also execute the formula in applications like Excel.
**Prevention:** Use a regex that allows leading whitespace (e.g. `/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/`) and include standalone tabs or new lines which are also injection vectors.

## 2024-06-23 - Information Leakage via Raw Exception Exposure
**Vulnerability:** The Python analysis engine was passing raw `Exception` objects (converted to strings) into user-facing IPC payloads when stem separation failed.
**Learning:** Exposing raw exceptions can leak sensitive internal details, such as absolute file paths, memory addresses, or underlying system architecture, violating the Desktop App Security Policy for Python boundaries.
**Prevention:** Catch generic exceptions and return a sanitized, predefined error string (e.g., "An internal error occurred") rather than exposing `str(error)` directly.
