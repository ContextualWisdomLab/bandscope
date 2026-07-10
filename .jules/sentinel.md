## 2024-05-18 - CSV Formula Injection whitespace bypass
**Vulnerability:** CSV formula injection mitigation was naive, missing leading whitespace, tabs, and newlines.
**Learning:** Checking `/^[=+\-@]/` is not sufficient, as OWASP states that spaces and tabs before the formula triggers will also execute the formula in applications like Excel.
**Prevention:** Use a regex that allows leading whitespace (e.g. `/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/`) and include standalone tabs or new lines which are also injection vectors.

## 2026-07-02 - Project ID path traversal guard
**Vulnerability:** Any project identifier that can reach a filesystem path join must be treated as untrusted, even when it is generated internally or passed through IPC lookup flows.
**Learning:** Reject only dangerous path segments (`.` and `..`) and path separators (`/` and `\`) so the guard blocks traversal without rejecting ordinary identifiers such as `my..id`.
**Prevention:** Keep project ID validation centralized before `base_root.join(project_id)`, and cover forward-slash, backslash, parent-component, and benign interior-dot cases in unit tests.
