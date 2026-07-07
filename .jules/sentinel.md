## 2024-05-18 - CSV Formula Injection whitespace bypass
**Vulnerability:** CSV formula injection mitigation was naive, missing leading whitespace, tabs, and newlines.
**Learning:** Checking `/^[=+\-@]/` is not sufficient, as OWASP states that spaces and tabs before the formula triggers will also execute the formula in applications like Excel.
**Prevention:** Use a regex that allows leading whitespace (e.g. `/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/`) and include standalone tabs or new lines which are also injection vectors.

## 2024-07-07 - Unsanitized Directory Input Paths API Validation
**Vulnerability:** The API logic allowed user-controlled local data directory paths (`cacheRoot` and `tempRoot`) to be directly used without mitigating cross-platform path traversal vulnerabilities.
**Learning:** Checking for '..' sequences in untrusted paths fails to parse cross-platform separators reliably for untrusted inputs (e.g., Windows backslashes on POSIX). Relying solely on `os.sep` or `os.altsep` is inadequate because absolute paths can bypass restrictions if not resolved correctly, or if `os.altsep` is None.
**Prevention:** Manually replace backslashes with forward slashes and split by forward slash (e.g., `if '..' in path.replace('\\', '/').split('/')`) to enforce path traversal protections explicitly for restricted directory inputs provided via the API. Do not block `~` for user-selected input files.
