## 2024-05-18 - CSV Formula Injection whitespace bypass
**Vulnerability:** CSV formula injection mitigation was naive, missing leading whitespace, tabs, and newlines.
**Learning:** Checking `/^[=+\-@]/` is not sufficient, as OWASP states that spaces and tabs before the formula triggers will also execute the formula in applications like Excel.
**Prevention:** Use a regex that allows leading whitespace (e.g. `/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/`) and include standalone tabs or new lines which are also injection vectors.

## 2025-02-24 - Path Traversal via os.path.expanduser
**Vulnerability:** Path traversal using `.expanduser()` on untrusted path input.
**Learning:** Avoid using `.expanduser()` on untrusted input paths in backend Python services, as it allows arbitrary path traversal.
**Prevention:** Instead, explicitly reject directory traversal sequences (e.g., checking for '..') and use standard path resolving methods like `Path(audio_path).resolve(strict=True)` to safely process local directories. Verify to pass automated CI vulnerability scanners (like Strix) and strictly maintain test cases.
