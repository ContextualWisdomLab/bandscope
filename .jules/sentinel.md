## 2024-05-18 - CSV Formula Injection whitespace bypass
**Vulnerability:** CSV formula injection mitigation was naive, missing leading whitespace, tabs, and newlines.
**Learning:** Checking `/^[=+\-@]/` is not sufficient, as OWASP states that spaces and tabs before the formula triggers will also execute the formula in applications like Excel.
**Prevention:** Use a regex that allows leading whitespace (e.g. `/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/`) and include standalone tabs or new lines which are also injection vectors.

## 2023-10-24 - [CRITICAL] Fix Path Traversal via expanduser in Local File Resolution
**Vulnerability:** The local stem separation engine (`audio_separator.py`) relied on `Path(audio_path).expanduser()` to parse user-provided local file paths and model profiles. This function does not prevent directory traversal sequences (e.g. `../`), allowing arbitrary file reads outside the intended boundary if user input is maliciously crafted.
**Learning:** Functions like `expanduser()` only resolve `~` to the home directory but implicitly preserve other relative components like `..`. When dealing with untrusted user input paths (even on local-first desktop apps), strict validation is necessary before passing them to file I/O operations.
**Prevention:** Explicitly block path traversal sequences by inspecting path parts for `..` (e.g. `".." in str_path.split(os.sep)`) and log a security warning before rejecting the input with an exception. Avoid relying solely on `expanduser` or `resolve()` for sanitization.
