## 2024-05-18 - CSV Formula Injection whitespace bypass
**Vulnerability:** CSV formula injection mitigation was naive, missing leading whitespace, tabs, and newlines.
**Learning:** Checking `/^[=+\-@]/` is not sufficient, as OWASP states that spaces and tabs before the formula triggers will also execute the formula in applications like Excel.
**Prevention:** Use a regex that allows leading whitespace (e.g. `/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/`) and include standalone tabs or new lines which are also injection vectors.

## 2024-05-20 - Python Path Traversal Mitigation bypass
**Vulnerability:** Path traversal detection in Python backend APIs relied solely on checking the input path string or basic parsed parts which might not adequately catch sequences like `..` when intermixed with different path separators.
**Learning:** Using `if ".." in Path(path).parts` incorrectly assumes `Path` parses mixed cross-platform separators reliably for untrusted input, particularly in heterogeneous environments. Instead, explicitly reject directory traversal sequences by replacing `\` with `/` and splitting on `/` to prevent bypassing automated CI vulnerability scanners (like Strix) as explicitly requested in memory.
**Prevention:** Always manually split the target path using both `/` and `\` manually instead of relying solely on `os.sep`, `os.altsep`, or `pathlib.Path.parts`. This ensures cross-platform payloads are reliably blocked even when executed on POSIX runners.
