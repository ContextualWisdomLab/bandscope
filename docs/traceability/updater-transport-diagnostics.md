# Updater transport diagnostics traceability

Status: source-repaired; hosted exact-head verification pending.

## Problem

The Distribution transport policy must preserve the exact release-asset redirect URL so the network adapter can request the admitted location and later prove exact effective-URL equality. GitHub release delivery may attach an opaque query component to the `release-assets.githubusercontent.com` URL. That query is provider-controlled transport data, not buyer-facing diagnostics.

`AdmittedRedirect` and `AdmittedDownloadHead` originally derived Rust `Debug`. Formatting either value therefore emitted the complete redirect/effective URL, including the opaque query. A later error path, structured diagnostic, panic assertion, or support bundle that formats these values could copy provider query data into logs even though query contents are unnecessary for diagnosis. RFC 3986 defines the query as a distinct URI component carrying non-hierarchical data; OWASP logging guidance recommends removing, masking, sanitizing, hashing, or encrypting access/session-style values instead of recording them directly.

The same diagnostics surface also retained the provisional Tauri signature string. `distribution-runtime` permits a signature field up to 64 KiB before the transport layer checks its canonical base64 envelope. The signature is public verification material rather than a credential, but dumping an attacker-controlled bounded field of that size into ordinary `Debug` output creates avoidable log amplification and carries no useful operational signal. Transport diagnostics need to know that signature evidence exists, not reproduce it.

## Constraints

- Preserve the exact redirect URL internally and through `AdmittedRedirect::location()` because the production network adapter must request exactly the admitted value.
- Preserve exact `AdmittedDownloadHead::effective_url()` for response binding. Redaction must affect diagnostics only, never transport equality or network behavior.
- Preserve exact `artifact_signature()` for the later Tauri verification boundary; diagnostic redaction must not mutate or replace verification input.
- Do not guess the provider's query parameter names or attempt semantic parsing of opaque query data.
- Do not add a URL or logging dependency for this narrow boundary.
- Keep ordinary `Debug` usability for tests and diagnostics while preventing opaque query payloads or full provisional signatures from appearing in formatted values.
- This change is log-surface minimization. It does not authenticate remote metadata, make a redirect trustworthy, or establish updater cryptographic verification.

## RED → repair evidence

- `c3dbebeff5ad4c9abe7e6d61cdded840bbfd9d3c` adds a regression that admits a valid one-hop CDN URL containing an opaque query, then requires both the redirect decision and final download-head `Debug` surfaces to contain a redaction marker while excluding the query value. The predecessor derived `Debug` prints the complete URL and therefore violates this contract.
- `be91505c0df2dc496849ae8b289f252643f9e055` removes derived `Debug` from the two URL-bearing types and implements bounded custom formatting. Only the substring after the first `?` is replaced with `<redacted-query>`; the exact stored URL and public exact-value accessors are unchanged.
- `935266a1065787443a2a441bcfdc2933905d1157` extends the diagnostics RED to require `ReleaseTransportPolicy` and `AdmittedDownloadHead` debug output to contain only `<redacted-signature>` while the exact `artifact_signature()` accessor still returns the admitted value. The predecessor custom download-head debug and derived policy debug both expose the full signature string.
- `1a4e8f541e3017f0e666935c3e003027b871d131` replaces policy derived debug with bounded custom formatting and redacts the signature field in both transport policy and download-head diagnostics. Signature validation, storage, equality and exact accessor behavior are unchanged.

## Selected design

A private `RedactedUrl` formatter owns URL diagnostic rendering. It does not allocate a second transport identity, modify stored state, normalize the URL, or feed back into policy decisions. URLs without a query render unchanged. URLs with a query retain the scheme/authority/path for operational diagnosis and render only a fixed redaction marker for the query component.

The query redaction is intentionally applied to both `AdmittedRedirect` and `AdmittedDownloadHead`: the first holds the URL before the follow-up request, while the second retains the same effective URL after the admitted `200`. Fixing only one would leave the same opaque query reachable from the other diagnostic surface.

Signature diagnostics use a fixed `<redacted-signature>` marker in both `ReleaseTransportPolicy` and `AdmittedDownloadHead`. The actual signature remains private state exposed only through the exact verification accessor. This bounds normal debug output independently of the remote signature-size allowance and avoids turning transport diagnostics into a copy of untrusted metadata.

## Claim boundary and remaining work

This repair prevents automatic Rust `Debug` output for the Distribution transport policy, redirect decision, and final download head from exposing redirect query contents or full provisional signature text. It does not prove that callers never log the explicit `location()`, `effective_url()`, or `artifact_signature()` accessors; those exact accessors remain necessary for the network and verification boundaries and must be handled as transport/security data. The future production HTTP adapter must avoid logging full request URLs, must still disable implicit redirects and automatic decompression, and must stream only admitted response bytes through `distribution-download`.

Remote metadata authentication, sealed-descriptor digest/signature verification, verified-artifact promotion, signer authority, packaged fault injection, and anti-replay state wiring remain separate release gates.

## References

Berners-Lee, T., Fielding, R., & Masinter, L. (2005). *Uniform Resource Identifier (URI): Generic Syntax* (RFC 3986). RFC Editor. https://www.rfc-editor.org/rfc/rfc3986

OWASP Foundation. (2026). *Logging Cheat Sheet*. OWASP Cheat Sheet Series. https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
