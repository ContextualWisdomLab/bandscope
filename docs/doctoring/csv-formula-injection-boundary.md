# CSV formula-injection boundary

## Decision

BandScope treats every cue-sheet field as untrusted spreadsheet input before
ordinary CSV structural quoting. The export guard prefixes a single quote when
the first effective spreadsheet token is an ASCII formula operator (`=`, `+`,
`-`, `@`), a supported full-width operator lookalike (`＝`, `＋`, `－`, `＠`),
or a dangerous leading control token (TAB, CR, LF, or NUL).

Only Unicode spacing separators and BOM are skipped while locating that first
effective token. TAB, CR, LF, and NUL are deliberately **not** consumed as
ordinary whitespace because they are themselves formula-injection trigger
characters in the adopted OWASP boundary. After formula neutralization,
BandScope retains RFC 4180-compatible double-quote handling for commas, line
breaks, and embedded double quotes.

This is a defense-in-depth export boundary, not a claim that one CSV escaping
strategy is universally safe across all spreadsheet applications or across a
save/re-open cycle. Product verification therefore keeps attacker-controlled
prefix regressions in the desktop test suite and treats future spreadsheet
behavior changes as a security-maintenance concern.

## Verification mapping

- OWASP ASVS `v5.0.0-1.2.10`: CSV/formula injection protection plus RFC 4180
  escaping; the requirement explicitly includes `=`, `+`, `-`, `@`, TAB, and
  NUL as first-character hazards.
- OWASP CSV Injection and WSTG CSV Injection guidance: TAB, CR, LF, and
  full-width formula-initiating variants are included in the spreadsheet
  trigger surface.
- RFC 4180 section 2.6-2.7: fields containing line breaks, commas, or double
  quotes are quoted and embedded double quotes are doubled.

The regression suite separately covers ASCII operators, spacing/BOM before an
operator, NUL-prefixed values, full-width operators, and control-token-only
prefixes such as `\tSAFE`, `\rSAFE`, and `\nSAFE`.

## Security Notes

The trust boundary is the serialized CSV cell consumed by spreadsheet software.
This change does not grant filesystem, network, subprocess, model, persistence,
or credential authority. The mitigated failure mode is attacker-controlled cell
content being reinterpreted as spreadsheet control syntax rather than inert
text. CSV quoting and formula neutralization are kept as separate operations so
record structure and spreadsheet interpretation are both testable.

## References

OWASP Foundation. (n.d.). *Application Security Verification Standard (ASVS)*.
https://owasp.org/www-project-application-security-verification-standard/

OWASP Foundation. (n.d.). *CSV injection*.
https://owasp.org/www-community/attacks/CSV_Injection

OWASP Foundation. (n.d.). *Testing for CSV injection*.
https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/21-Testing_for_CSV_Injection

Shafranovich, Y. (2005, October). *Common format and MIME type for
comma-separated values (CSV) files* (RFC 4180). Internet Engineering Task
Force. https://datatracker.ietf.org/doc/rfc4180/
