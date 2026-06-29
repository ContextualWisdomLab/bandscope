## 2024-03-24 - [Information Leakage in Python Exception Handling]
**Vulnerability:** Raw exception strings containing internal file paths and system details were being serialized into JSON responses (e.g., `f"Failed to read job file: {e}"`).
**Learning:** Catch-all exception blocks (like `except Exception as e:`) can inadvertently expose sensitive system state to end users if the string representation of the exception is returned directly.
**Prevention:** Replace raw exception interpolations with generic, safe error messages intended for external consumption, logging the full stack trace internally if needed.
