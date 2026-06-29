## 2023-10-25 - Prevent information leakage from uncaught exceptions
**Vulnerability:** In Python backend tasks (like stem separation workers), a general `except Exception as error` block leaked the raw stack trace or file path contents into the user-facing IPC `runtime_error` message string by calling `str(error)` directly.
**Learning:** Backend worker processes often fail on arbitrary external exceptions that can carry verbose inner details. Leaking these violates the 'Fail securely' rule.
**Prevention:** Replace broad exception casting (like `str(error)`) with generalized static strings (e.g., 'An unexpected error occurred...'). Ensure all explicitly caught errors are intentionally formatted for public reporting, rather than directly coercing exception bodies.
