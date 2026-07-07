## 2024-05-18 - CSV Formula Injection whitespace bypass
**Vulnerability:** CSV formula injection mitigation was naive, missing leading whitespace, tabs, and newlines.
**Learning:** Checking `/^[=+\-@]/` is not sufficient, as OWASP states that spaces and tabs before the formula triggers will also execute the formula in applications like Excel.
**Prevention:** Use a regex that allows leading whitespace (e.g. `/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/`) and include standalone tabs or new lines which are also injection vectors.
## 2024-05-18 - Exception Handling Information Leakage
**Vulnerability:** Raw exception objects were returned and exposed via queue results in `api.py` stem separation worker.
**Learning:** `except Exception as error: result_queue.put(("runtime_error", str(error)))` leaks internal file paths, module structures, and implementation details.
**Prevention:** Catch generic exceptions and return static safe strings instead of `str(error)` to prevent user-facing information leakage.
