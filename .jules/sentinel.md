## 2024-05-18 - CSV Formula Injection whitespace bypass
**Vulnerability:** CSV formula injection mitigation was naive, missing leading whitespace, tabs, and newlines.
**Learning:** Checking `/^[=+\-@]/` is not sufficient, as OWASP states that spaces and tabs before the formula triggers will also execute the formula in applications like Excel.
**Prevention:** Use a regex that allows leading whitespace (e.g. `/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/`) and include standalone tabs or new lines which are also injection vectors.

## 2025-06-22 - URL Parsing Length Limit
**Vulnerability:** Unbounded URL inputs across TypeScript, Rust, and Python entry points.
**Learning:** Regular expressions and URL parsers can spend avoidable CPU or memory on oversized attacker-controlled strings.
**Prevention:** Cap URL length to the product-supported maximum before handing user input to regex or URL parsers.
