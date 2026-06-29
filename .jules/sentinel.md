## 2024-05-18 - CSV Formula Injection whitespace bypass
**Vulnerability:** CSV formula injection mitigation was naive, missing leading whitespace, tabs, and newlines.
**Learning:** Checking `/^[=+\-@]/` is not sufficient, as OWASP states that spaces and tabs before the formula triggers will also execute the formula in applications like Excel.
**Prevention:** Use a regex that allows leading whitespace (e.g. `/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/`) and include standalone tabs or new lines which are also injection vectors.

## 2026-06-29 - Path Traversal Vulnerability in Backend Audio Analysis
**Vulnerability:** Untrusted paths passed from the frontend for `audio_path` and `model_profile_path` were processed using `Path().expanduser()` and lacked validation against path traversal components like `..`, potentially exposing arbitrary local files.
**Learning:** Functions like `os.path.expanduser` or `Path().expanduser()` should not be used with untrusted inputs. Path traversal validation (e.g., checking for `..` sequences) must be explicit when dynamically accessing paths.
**Prevention:** Strictly sanitize untrusted dynamic paths, remove `.expanduser()`, and explicitly validate inputs (e.g., `if ".." in str(path): raise ValueError(...)`) to prevent path traversal risks, followed by automated CI vulnerability scanners (like Strix) validation.
