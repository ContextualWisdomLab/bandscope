# Cue-sheet CSV formula neutralization

## Decision

BandScope treats every rehearsal-derived CSV field as untrusted spreadsheet input. The analysis-engine cue-sheet exporter neutralizes spreadsheet-sensitive prefixes before handing each field to Python's standard `csv` writer. This is a defense-in-depth boundary for exported artifacts that may later be opened in Microsoft Excel, LibreOffice Calc, Apple Numbers, or another spreadsheet application.

The stable verification baseline is OWASP Application Security Verification Standard (ASVS) 5.0.0 requirement `v5.0.0-1.2.10`. It requires CSV/formula-injection protection, RFC 4180 sections 2.6 and 2.7 field escaping, and a leading single quote when `=`, `+`, `-`, `@`, tab, or NUL is the first character of an exported spreadsheet field. BandScope additionally neutralizes CR/LF and the full-width variants `＝`, `＋`, `－`, and `＠` identified by current OWASP CSV Injection/WSTG guidance. Formula or control prefixes exposed after leading whitespace are treated as defense in depth rather than as an ASVS requirement.

## Threat model and boundary

Attacker-controlled section labels, cue text, and role display names can cross from BandScope's rehearsal data model into a CSV cell. A spreadsheet may then interpret a leading formula token as executable spreadsheet syntax, creating a downstream injection boundary even though BandScope itself does not execute the formula.

BandScope therefore applies two independent controls:

1. `escape_csv_field` prefixes a spreadsheet-sensitive field with an apostrophe so the first cell character is no longer a formula/control prefix.
2. `csv.writer` performs delimiter and quote serialization, including quoting fields that contain commas, quotes, or line breaks and doubling embedded double quotes. This implements the CSV field-boundary behavior described by RFC 4180 sections 2.6 and 2.7.

The mitigation is intentionally documented as defense in depth rather than a universal guarantee. Spreadsheet implementations differ, and current OWASP guidance warns that Excel may transform CSV escaping when a file is saved and reopened. Exported CSV files must therefore continue to be treated as untrusted documents by downstream tooling.

## Verification contract

Regression tests require all of the following:

- ordinary text and whitespace-only values remain unchanged;
- ASCII formula prefixes are neutralized;
- full-width formula prefixes are neutralized;
- tab, CR, LF, and leading NUL controls are neutralized;
- a formula or control prefix exposed after leading whitespace, including the previously observed `" \x00=SUM(A1)"` case, is neutralized;
- attacker-controlled commas remain inside one parsed field after serialization;
- malformed or row-less song payloads keep the existing fail-closed empty export behavior.

Repository coverage, SAST/security, supply-chain, and review gates remain authoritative for the exact pull-request head. No scanner exception or dependency change is part of this CSV feature slice.

## Standards traceability

| Control | BandScope evidence | Primary authority |
| --- | --- | --- |
| First-character `=`, `+`, `-`, `@`, tab, NUL | `escape_csv_field` + parameterized regressions | OWASP ASVS `v5.0.0-1.2.10`; MITRE CWE-1236 |
| CR/LF and full-width formula variants | `escape_csv_field` + parameterized regressions | OWASP CSV Injection; OWASP WSTG `WSTG-INPV-21` |
| Formula/control prefix after leading whitespace | `escape_csv_field` + `" \x00=SUM(A1)"` regression | BandScope defense in depth; not claimed as an ASVS mandate |
| Embedded delimiter/quote/line-break field boundaries | Python `csv.writer`; parsed-row regression | RFC 4180 §§ 2.6–2.7; OWASP ASVS `v5.0.0-1.2.10` |
| Residual spreadsheet-product differences | Explicit downstream-untrusted-document warning | MITRE CWE-1236; OWASP WSTG `WSTG-INPV-21` |

## References

MITRE. (2026). *CWE-1236: Improper neutralization of formula elements in a CSV file* (CWE version 4.20). Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/1236.html

OWASP Foundation. (2025). *OWASP Application Security Verification Standard 5.0.0* (Requirement v5.0.0-1.2.10, CSV and formula injection). https://github.com/OWASP/ASVS/tree/v5.0.0_release/5.0

OWASP Foundation. (n.d.). *CSV injection*. Retrieved August 16, 2026, from https://owasp.org/www-community/attacks/CSV_Injection

OWASP Foundation. (n.d.). *Testing for CSV injection* (WSTG-INPV-21). *OWASP Web Security Testing Guide*. Retrieved August 16, 2026, from https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/21-Testing_for_CSV_Injection

Shafranovich, Y. (2005). *Common format and MIME type for comma-separated values (CSV) files* (RFC 4180). RFC Editor. https://doi.org/10.17487/RFC4180
