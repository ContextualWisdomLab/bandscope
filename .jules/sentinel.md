## 2024-05-18 - CSV Formula Injection whitespace bypass
**Vulnerability:** CSV formula injection mitigation was naive, missing leading whitespace, tabs, and newlines.
**Learning:** Checking `/^[=+\-@]/` is not sufficient, as OWASP states that spaces and tabs before the formula triggers will also execute the formula in applications like Excel.
**Prevention:** Use a regex that allows leading whitespace (e.g. `/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/`) and include standalone tabs or new lines which are also injection vectors.

## 2024-10-24 - [Information Leakage in Error Handling]
**Vulnerability:** A catch-all exception handler in `services/analysis-engine/src/bandscope_analysis/api.py` passed raw `str(error)` exception strings through the `result_queue`, which were then raised as `RuntimeError(str(payload))` and leaked in orchestrator logs and status updates.
**Learning:** Returning or logging raw exception objects can leak sensitive internal details, file paths, or architecture information, violating the principle of failing securely.
**Prevention:** Always log the raw exception object internally using `logger.error` for debugging, but return a generic, safe error message to the client or outer orchestrator layer (e.g., "Stem separation failed due to an internal error.").
