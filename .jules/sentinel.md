## 2024-05-18 - CSV Formula Injection whitespace bypass
**Vulnerability:** CSV formula injection mitigation was naive, missing leading whitespace, tabs, and newlines.
**Learning:** Checking `/^[=+\-@]/` is not sufficient, as OWASP states that spaces and tabs before the formula triggers will also execute the formula in applications like Excel.
**Prevention:** Use a regex that allows leading whitespace (e.g. `/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/`) and include standalone tabs or new lines which are also injection vectors.

## 2026-03-12 - Prevent Information Leakage Through Exception Payloads
**Vulnerability:** Raw exception objects and error traces (e.g. from FileNotFoundError, ValueError, and general Exceptions) were being converted to strings and passed from the python engine's multiprocessing queues (`services/analysis-engine/src/bandscope_analysis/api.py`) or JSON CLI outputs (`services/analysis-engine/src/bandscope_analysis/cli.py`) directly back to the orchestrating or frontend layers.
**Learning:** Returning `str(error)` in `except` blocks can inadvertently leak file paths, internal environment context, or third-party library details, violating the "fail securely" and "Do not expose raw exception objects/paths" mandates.
**Prevention:** Ensure that all generic exceptions caught at security boundaries (like IPC or user interfaces) are masked with a generic message (e.g. "An internal engine error occurred") before leaving the boundary. Error logging on the backend should still capture the original message for debugging.
