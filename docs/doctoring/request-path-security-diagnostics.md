# Request-path security diagnostics

## Decision

BandScope rejects `..` path-traversal segments at the Python Resource Admission boundary before local-audio analysis. Rejection of `localSource.sourcePath` now emits the same kind of bounded security diagnostic already used for `projectId`, `cacheRoot`, and `tempRoot`, but the diagnostic contains only the fixed field identifier. The submitted path is never copied into the log message.

This is deliberate. `localSource.sourcePath` crosses from the desktop request into the analysis engine and can contain user-local directory names, control characters, or attacker-chosen text. Logging that value verbatim, through `repr()`, or through a parameterized placeholder would retain attacker-controlled content in durable diagnostic output. BandScope therefore records the event class and field name, not the path payload.

## RED → production → exact repair

RED `0e313169299eb6112343ca7d8fbac612d6df5942` adds a request containing both a parent-traversal segment and a forged newline suffix. The regression requires the request to fail, requires exactly one warning containing only `localSource.sourcePath`, and asserts that the malicious path is absent from the logger call.

Production `5546a17ccc848e2d043359586a2abc0bd198a66c` adds the bounded warning immediately before the existing traversal rejection. Review of that commit found two unrelated text-only drifts introduced while applying the one-line source repair. Descendant `7c0e858da327daa07b56c75b2a90a2761b4c4880` restores those lines. Comparing the pre-RED product head `4cb93a74b2668440479ed0ac884c60505acd7883` with `7c0e858d...` shows only one production-line addition plus the dedicated regression file.

The earlier parallel Draft #1194 supplied the valid product finding. Its scanner-learning metadata is not a second runtime owner. Canonical implementation and regression ownership remain #866.

## Alternatives rejected

Logging the complete rejected path was rejected because the diagnostic does not require source identity and would persist user-local path data. Escaping the value with `repr()` was also rejected: escaping presentation characters does not remove the underlying attacker-controlled or privacy-sensitive content. Parameterizing the raw path with `%s` was rejected for the same reason.

Suppressing all diagnostics was rejected because the other traversal fields already produce bounded security signals and `localSource.sourcePath` is the most direct local-file request boundary. The fixed field identifier preserves useful operational evidence without expanding log authority.

## Claim boundary

This control prevents the rejected path payload itself from entering this warning. It does not claim that every downstream library, operating-system error, decoder, or unrelated log statement is path-redacted. Those boundaries require their own tests and security review. The traversal predicate is unchanged by this repair; this change adds bounded observability to an already rejected request.

## TRACEABILITY

- Resource Admission source: `services/analysis-engine/src/bandscope_analysis/api.py::validate_analysis_job_request`.
- Regression: `services/analysis-engine/tests/test_request_security_diagnostics.py`.
- Canonical owner: #866; #1194 is a preservation/consolidation source only.
- Weakness model: CWE-117, Improper Output Neutralization for Logs. MITRE describes the weakness as constructing log output from external input without sufficient neutralization and notes log-forging consequences; BandScope avoids the source-to-log data flow entirely for this diagnostic.

## Reference

MITRE Corporation. (2026). *CWE-117: Improper Output Neutralization for Logs* (CWE List Version 4.20). Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/117.html
