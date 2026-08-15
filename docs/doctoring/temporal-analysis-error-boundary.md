# Temporal analysis error boundary

## Decision

BandScope separates **caller-facing recovery information** from **repository-controlled diagnostic detail** for unexpected temporal-analysis dependency failures.

`TemporalAnalyzer.analyze()` now exposes one stable, action-oriented public error for unexpected decoder, duration, beat-tracking, frame-conversion, onset, and other third-party failures:

> Temporal analysis failed. Try the file again or choose another supported audio file.

The underlying exception text is not copied into that public `ValueError`. The original exception and traceback are still emitted through the repository logger before the public error is raised, so authorized local diagnostics retain the evidence needed to investigate operational failures. This is an error-boundary separation, not masking or rewriting the user's audio, metadata, file contents, or other business data.

Repository-authored validation failures remain distinct. The analyzer continues to tell callers when the selected file exceeds BandScope's explicit temporal-analysis size limit or when the decoder violates the internal array contract. Those messages are authored by BandScope and do not copy arbitrary third-party exception text.

## Threat and operability rationale

MITRE CWE-209 identifies detailed error messages as an information-disclosure weakness when they expose environment, user, or associated-data details, and recommends handling exceptions internally while limiting caller-visible detail to what the intended audience needs. A third-party audio exception can contain implementation-specific values such as paths, decoder state, or media metadata; copying that text verbatim into a caller-visible error makes the dependency the de facto author of BandScope's product error surface.

The bounded public message keeps the next action clear without sacrificing diagnosis. NIST SP 800-92 treats logs as operational and security records that require deliberate generation, access, storage, and management. BandScope therefore retains the original exception in the repository-controlled logging channel rather than putting dependency-shaped diagnostic text into the public error contract. Access control, retention, collection, and export policy for those logs remain operability responsibilities and are not weakened or bypassed by this change.

## Test contract

The regression suite requires that:

- an unexpected decoder exception produces the exact stable recovery message;
- an unexpected beat-tracking exception produces the same exact recovery message;
- attacker- or environment-shaped detail embedded in either third-party exception is absent from the public `ValueError`;
- explicit BandScope size-limit validation remains actionable and is not collapsed into the generic failure;
- the internal non-array decoder-contract violation remains actionable; and
- ordinary successful temporal analysis, warning visibility, duration limiting, beat/downbeat extraction, and missing-file behavior remain unchanged.

## Privacy and compliance boundary

This change does **not** redact PII from authorized business records and does not alter the analyzed audio or its identifiers. It limits only the public exception contract for unexpected dependency failures. Detailed diagnostic exceptions remain available to repository-controlled logging and therefore must be protected under the deployment's log-access, retention, and incident-response controls. That separation supports SOC 2/CSAP evidence readiness without making masking a prerequisite for ordinary analysis work.

## References

Kent, K., & Souppaya, M. (2006). *Guide to computer security log management* (NIST Special Publication 800-92). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-92

MITRE. (2026). *CWE-209: Generation of error message containing sensitive information (Version 4.20).* https://cwe.mitre.org/data/definitions/209.html

Scarfone, K., & Souppaya, M. (2023). *Cybersecurity log management planning guide* (NIST Special Publication 800-92 Rev. 1, Initial Public Draft). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-92r1.ipd
