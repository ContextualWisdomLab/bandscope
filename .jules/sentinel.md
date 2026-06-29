## 2024-05-18 - CSV Formula Injection whitespace bypass
**Vulnerability:** CSV formula injection mitigation was naive, missing leading whitespace, tabs, and newlines.
**Learning:** Checking `/^[=+\-@]/` is not sufficient, as OWASP states that spaces and tabs before the formula triggers will also execute the formula in applications like Excel.
**Prevention:** Use a regex that allows leading whitespace (e.g. `/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/`) and include standalone tabs or new lines which are also injection vectors.

## 2025-06-22 - [URL Parsing Length Limit]
**Vulnerability:** Unbounded URL inputs across three languages (TypeScript, Rust, Python).
**Learning:** Regular expressions or URL parsing mechanisms parsing unbounded input length can easily exhaust memory or CPU resources, causing Denial of Service (DoS).
**Prevention:** Always restrict unbounded input length based on expected constraints *before* handing it to regex parsers or complex parsers. 2000 is a safe standard maximum length for URLs.