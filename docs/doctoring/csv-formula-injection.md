# Cue-sheet CSV formula neutralization

## Decision

BandScope treats every rehearsal-derived CSV field as untrusted spreadsheet input. The analysis-engine cue-sheet exporter neutralizes spreadsheet-sensitive prefixes before handing each field to Python's standard `csv` writer. This is a defense-in-depth boundary for exported artifacts that may later be opened in Microsoft Excel, LibreOffice Calc, Apple Numbers, or another spreadsheet application.

The implementation covers the formula initiators identified by CWE-1236 (`=`, `+`, `-`, and `@`) and the additional control/full-width prefixes in current OWASP CSV Injection testing guidance: horizontal tab, carriage return, line feed, and the full-width variants `＝`, `＋`, `－`, and `＠`. Formula initiators hidden behind leading whitespace are also neutralized because spreadsheet import behavior is not uniform across products.

OWASP ASVS 5.0.0 requirement `v5.0.0-1.2.10` is the current stable verification baseline for this boundary. It requires CSV/formula-injection protection, the RFC 4180 section 2.6/2.7 quoting rules, and single-apostrophe escaping when `=`, `+`, `-`, `@`, tab, or NUL is the first field character. BandScope's leading-NUL rule therefore directly satisfies the current ASVS requirement; the broader leading-whitespace, CR/LF, and full-width handling remains defense in depth informed by OWASP's current CSV Injection testing guidance.

## Threat model and boundary

Attacker-controlled section labels, cue text, and role display names can cross from BandScope's rehearsal data model into a CSV cell. A spreadsheet may then interpret a leading formula token as executable spreadsheet syntax, creating a downstream injection boundary even though BandScope itself does not execute the formula.

BandScope therefore applies two independent controls:

1. `escape_csv_field` prefixes a spreadsheet-sensitive field with an apostrophe so the first cell character is no longer a formula/control prefix.
2. `csv.writer` performs delimiter and quote serialization, including enclosing fields containing commas, quotes, or line breaks and doubling embedded double quotes. This is the field-boundary behavior required by RFC 4180 section 2 items 6 and 7 and referenced by ASVS `v5.0.0-1.2.10`.

The mitigation is intentionally documented as defense in depth rather than a universal guarantee. CWE-1236 notes that spreadsheet implementations differ, and OWASP's current WSTG guidance notes that Excel can transform CSV escaping when files are saved and reopened. Exported CSV files must continue to be treated as untrusted documents by downstream tooling.

## Verification contract

Regression tests require all of the following:

- ordinary text and whitespace-only values remain unchanged;
- ASCII formula prefixes are neutralized;
- full-width formula prefixes are neutralized;
- tab, CR, LF, and leading NUL controls are neutralized;
- a dangerous prefix after leading whitespace is neutralized;
- attacker-controlled commas remain inside one parsed field after serialization;
- malformed or row-less song payloads keep the existing fail-closed empty export behavior.

Repository coverage, SAST/security, supply-chain, and review gates remain authoritative for the exact pull-request head. No scanner exception or dependency change is part of this CSV feature slice.

## Standards traceability

| Control | BandScope evidence | Primary authority |
| --- | --- | --- |
| Formula-leading `=`, `+`, `-`, `@` | `escape_csv_field` + parameterized regression tests | OWASP ASVS `v5.0.0-1.2.10`; MITRE CWE-1236 |
| Leading tab and NUL | `escape_csv_field` + parameterized regression tests | OWASP ASVS `v5.0.0-1.2.10` |
| CR/LF and full-width formula variants | `escape_csv_field` + parameterized regression tests | OWASP WSTG `WSTG-INPV-21` |
| Embedded delimiter/quote/line-break field boundaries | Python `csv.writer`; parsed-row regression | RFC 4180 §2.6–2.7; OWASP ASVS `v5.0.0-1.2.10` |
| Residual spreadsheet-product differences | Explicit downstream-untrusted-document warning | MITRE CWE-1236; OWASP WSTG `WSTG-INPV-21` |

## References

MITRE. (2026). *CWE-1236: Improper neutralization of formula elements in a CSV file* (CWE version 4.20). Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/1236.html

OWASP Foundation. (2025). *OWASP Application Security Verification Standard 5.0.0* (Requirement v5.0.0-1.2.10, CSV and formula injection). https://github.com/OWASP/ASVS/tree/v5.0.0_release/5.0

OWASP Foundation. (n.d.). *CSV injection*. Retrieved August 16, 2026, from https://owasp.org/www-community/attacks/CSV_Injection

OWASP Foundation. (n.d.). *Testing for CSV injection* (WSTG-INPV-21). *OWASP Web Security Testing Guide*. Retrieved August 16, 2026, from https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/21-Testing_for_CSV_Injection

Shafranovich, Y. (2005). *Common format and MIME type for comma-separated values (CSV) files* (RFC 4180). RFC Editor. https://doi.org/10.17487/RFC4180
