# Temporal analysis error boundary

## Decision

BandScope separates **caller-facing recovery information** from **repository-controlled diagnostic metadata** for unexpected temporal-analysis dependency failures.

`TemporalAnalyzer.analyze()` exposes one stable, action-oriented public error for unexpected decoder, duration, beat-tracking, frame-conversion, onset, and other third-party failures:

> Temporal analysis failed. Try the file again or choose another supported audio file.

The underlying exception text is not copied into that public `ValueError`. It is also not copied wholesale into the temporal analyzer's logs: dependency-controlled exception text and tracebacks can contain local paths, tokens, media metadata, or other user-associated detail. The repository logger records a stable operation-level failure event and the exception class only. The selected local-audio path is not emitted by this analyzer's normal load log. This is an error-boundary separation, not masking or rewriting the user's audio, metadata, file contents, identifiers, or other authorized business data.

Repository-authored validation failures remain distinct. The analyzer continues to tell callers when the selected file exceeds BandScope's explicit temporal-analysis size limit or when the decoder violates the internal array contract. Those messages are authored by BandScope and do not copy arbitrary third-party exception text.

## Threat and operability rationale

MITRE CWE-209 identifies detailed error messages as an information-disclosure weakness when they expose environment, user, or associated-data details, and recommends handling exceptions internally while limiting exposed detail to what the intended audience needs. A third-party audio exception can contain implementation-specific values such as paths, decoder state, media metadata, or secret-shaped values; copying that text verbatim into either the caller-facing error or ordinary logs makes the dependency the de facto author of BandScope's diagnostic surface.

The bounded public message keeps the next action clear. The bounded log event retains enough information to correlate that temporal analysis failed and to classify the exception type without storing attacker-controlled exception text or the selected local path. NIST SP 800-92 treats logs as operational and security records that require deliberate generation, access, storage, and management; collecting less unnecessary sensitive material reduces the data that downstream log access, retention, export, and incident-response controls must protect. Deeper debugging that requires media- or dependency-specific detail should be reproduced in an explicitly authorized, constrained diagnostic context rather than enabled by blanket production logging of raw exception payloads.

## Test contract

The regression suite requires that:

- an unexpected decoder exception produces the exact stable recovery message;
- an unexpected beat-tracking exception produces the same exact recovery message;
- attacker- or environment-shaped detail embedded in either third-party exception is absent from the public `ValueError`;
- the temporal diagnostic log contains the stable operation-level failure event while excluding the selected local path, raw dependency exception detail, and secret-shaped payload text;
- explicit BandScope size-limit validation remains actionable and is not collapsed into the generic failure;
- the internal non-array decoder-contract violation remains actionable; and
- ordinary successful temporal analysis, warning visibility, duration limiting, beat/downbeat extraction, and missing-file behavior remain unchanged.

## Privacy and compliance boundary

This change does **not** redact PII from authorized business records and does not alter the analyzed audio or its identifiers. It limits only unnecessary propagation of path- and dependency-shaped diagnostic payloads across the public-error and ordinary-log boundaries. Necessary analysis data remains available to the authorized analysis workflow. Repository-controlled logs retain the stable failure event and exception class and remain subject to deployment log-access, retention, collection, export, and incident-response controls. That minimum-necessary diagnostic contract supports SOC 2/CSAP evidence readiness without making indiscriminate masking a prerequisite for ordinary analysis work.

## References

Kent, K., & Souppaya, M. (2006). *Guide to computer security log management* (NIST Special Publication 800-92). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-92

MITRE. (2026). *CWE-209: Generation of error message containing sensitive information (Version 4.20).* https://cwe.mitre.org/data/definitions/209.html

Scarfone, K., & Souppaya, M. (2023). *Cybersecurity log management planning guide* (NIST Special Publication 800-92 Rev. 1, Initial Public Draft). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-92r1.ipd
