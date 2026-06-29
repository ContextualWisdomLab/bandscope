## 2024-06-25 - Prevent exception information leakage in IPC queues
**Vulnerability:** Raw exceptions inside background workers were being cast to string (`str(error)`) and propagated over multiprocessing queues into IPC payloads.
**Learning:** Returning raw Python exception strings can expose memory states (e.g. `oom`), file paths (e.g. `FileNotFoundError`), or underlying decoding libraries' error states to the client. Using a generic error message per exception type stops the leakage while logging the actual traceback to the internal logger via `logger.error("...", exc_info=True)`.
**Prevention:** Avoid blindly re-raising or returning `str(error)` in worker wrappers. Map specific exceptions to safe, static strings and log the real error using the module-level logger.
