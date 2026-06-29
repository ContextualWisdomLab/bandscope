## 2024-05-18 - CSV Formula Injection whitespace bypass
**Vulnerability:** CSV formula injection mitigation was naive, missing leading whitespace, tabs, and newlines.
**Learning:** Checking `/^[=+\-@]/` is not sufficient, as OWASP states that spaces and tabs before the formula triggers will also execute the formula in applications like Excel.
**Prevention:** Use a regex that allows leading whitespace (e.g. `/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/`) and include standalone tabs or new lines which are also injection vectors.
## 2026-06-25 - Frontend Input Length Limit (DoS Mitigation)
**Vulnerability:** The YouTube URL `<Input />` component in the desktop app lacked a `maxLength` attribute, potentially allowing users to paste excessively long strings, leading to UI thread lockups or memory exhaustion (Denial of Service).
**Learning:** Even client-side inputs communicating with a secure backend should enforce length constraints at the DOM level to prevent resource exhaustion vulnerabilities and performance degradation.
**Prevention:** Enforce length limits (e.g., `maxLength={2048}`) on all user-facing text `<Input />` components.
