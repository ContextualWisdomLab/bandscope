# Cue-sheet CSV formula neutralization

## Decision

BandScope treats every rehearsal-derived CSV field as untrusted spreadsheet input. The analysis-engine cue-sheet exporter neutralizes spreadsheet-sensitive prefixes before handing each field to Python's standard `csv` writer. This is a defense-in-depth boundary for exported artifacts that may later be opened in Microsoft Excel, LibreOffice Calc, Apple Numbers, or another spreadsheet application.

The implementation covers the formula initiators identified by CWE-1236 (`=`, `+`, `-`, and `@`) and the additional control/full-width prefixes in current OWASP CSV Injection guidance: horizontal tab, carriage return, line feed, and the full-width variants `＝`, `＋`, `－`, and `＠`. Formula initiators hidden behind leading whitespace are also neutralized because spreadsheet import behavior is not uniform across products. A leading NUL byte is neutralized separately as parser-hardening defense in depth; that NUL rule is not attributed to CWE-1236 or OWASP's formula-prefix list.

## Threat model and boundary

Attacker-controlled section labels, cue text, and role display names can cross from BandScope's rehearsal data model into a CSV cell. A spreadsheet may then interpret a leading formula token as executable spreadsheet syntax, creating a downstream injection boundary even though BandScope itself does not execute the formula.

BandScope therefore applies two independent controls:

1. `escape_csv_field` prefixes a spreadsheet-sensitive field with an apostrophe so the first cell character is no longer a formula/control prefix.
2. `csv.writer` performs delimiter, quote, and line-break serialization, preventing an embedded comma or quote from being emitted as a raw sibling cell boundary.

The mitigation is intentionally documented as defense in depth rather than a universal guarantee. CWE-1236 notes that spreadsheet implementations differ, and OWASP notes that Excel can transform CSV escaping when files are saved and reopened. Exported CSV files must continue to be treated as untrusted documents by downstream tooling.

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

## References

MITRE. (2026). *CWE-1236: Improper neutralization of formula elements in a CSV file*. Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/1236.html

OWASP Foundation. (n.d.). *CSV injection*. Retrieved August 14, 2026, from https://owasp.org/www-community/attacks/CSV_Injection

OWASP Foundation. (n.d.). *Testing for CSV injection*. *OWASP Web Security Testing Guide*. Retrieved August 14, 2026, from https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/21-Testing_for_CSV_Injection
