## 2024-05-18 - CSV Formula Injection whitespace bypass
**Vulnerability:** CSV formula injection mitigation was naive, missing leading whitespace, tabs, and newlines.
**Learning:** Checking `/^[=+\-@]/` is not sufficient, as OWASP states that spaces and tabs before the formula triggers will also execute the formula in applications like Excel.
**Prevention:** Use a regex that allows leading whitespace (e.g. `/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/`) and include standalone tabs or new lines which are also injection vectors.
## 2026-06-27 - [Path Traversal in AudioStemSeparator File Loads]
**Vulnerability:** The local `AudioStemSeparator` accepted untrusted audio source paths and model profile path overrides without robust verification against path traversal. It used `Path.expanduser()` which implicitly resolves `~` but failed to sanitize relative directory traversal (`../`).
**Learning:** `Path.expanduser()` is risky for handling dynamic, untrusted paths, as it doesn't protect against walking back up a directory tree using `../`. Although `.resolve(strict=True)` helps ensure existence, it doesn't block directory traversal attacks leading to sensitive files (e.g. `../../../../etc/passwd`).
**Prevention:** Remove `Path.expanduser()` on input paths in backend services receiving untrusted local file paths, and explicitly raise an error when path traversal sequences (`..`) are detected in the given paths. Ensure 100% test coverage encompasses explicitly asserting this failure behavior.
