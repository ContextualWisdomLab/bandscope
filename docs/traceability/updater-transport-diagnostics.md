# Updater transport diagnostics traceability

Status: source-repaired; hosted exact-head verification pending.

## Problem

The Distribution transport policy must preserve the exact release-asset redirect URL so the network adapter can request the admitted location and later prove exact effective-URL equality. GitHub release delivery may attach an opaque query component to the `release-assets.githubusercontent.com` URL. That query is provider-controlled transport data, not buyer-facing diagnostics.

`AdmittedRedirect` and `AdmittedDownloadHead` originally derived Rust `Debug`. Formatting either value therefore emitted the complete redirect/effective URL, including the opaque query. A later error path, structured diagnostic, panic assertion, or support bundle that formats these values could copy provider query data into logs even though query contents are unnecessary for diagnosis. RFC 3986 defines the query as a distinct URI component carrying non-hierarchical data; OWASP logging guidance recommends removing, masking, sanitizing, hashing, or encrypting access/session-style values instead of recording them directly.

The same diagnostics surface also retained the provisional Tauri signature string. `distribution-runtime` permits a signature field up to 64 KiB before the transport layer checks its canonical base64 envelope. The signature is public verification material rather than a credential, but dumping an attacker-controlled bounded field of that size into ordinary `Debug` output creates avoidable log amplification and carries no useful operational signal. Transport diagnostics need to know that signature evidence exists, not reproduce it.

Fresh review found the same signature exposure one boundary earlier. `ProvisionalUpdateMetadata` still derived `Debug`, so formatting the strictly parsed but unauthenticated metadata copied the exact selected signature before `distribution-transport` had any opportunity to redact it. Fixing only transport types therefore left a direct 64 KiB remote-input log-amplification surface in the metadata-admission owner itself.

## Constraints

- Preserve the exact redirect URL internally and through `AdmittedRedirect::location()` because the production network adapter must request exactly the admitted value.
- Preserve exact `AdmittedDownloadHead::effective_url()` for response binding. Redaction must affect diagnostics only, never transport equality or network behavior.
- Preserve exact `artifact_signature()` in both provisional metadata and transport values for the later Tauri verification boundary; diagnostic redaction must not mutate or replace verification input.
- Do not guess the provider's query parameter names or attempt semantic parsing of opaque query data.
- Do not add a URL or logging dependency for this narrow boundary.
- Keep ordinary `Debug` usability for tests and diagnostics while preventing opaque query payloads or full provisional signatures from appearing in formatted values.
- This change is log-surface minimization. It does not authenticate remote metadata, make a redirect trustworthy, or establish updater cryptographic verification.

## RED → repair evidence

- `c3dbebeff5ad4c9abe7e6d61cdded840bbfd9d3c` adds a regression that admits a valid one-hop CDN URL containing an opaque query, then requires both the redirect decision and final download-head `Debug` surfaces to contain a redaction marker while excluding the query value. The predecessor derived `Debug` prints the complete URL and therefore violates this contract.
- `be91505c0df2dc496849ae8b289f252643f9e055` removes derived `Debug` from the two URL-bearing types and implements bounded custom formatting. Only the substring after the first `?` is replaced with `<redacted-query>`; the exact stored URL and public exact-value accessors are unchanged.
- `935266a1065787443a2a441bcfdc2933905d1157` extends the diagnostics RED to require `ReleaseTransportPolicy` and `AdmittedDownloadHead` debug output to contain only `<redacted-signature>` while the exact `artifact_signature()` accessor still returns the admitted value. The predecessor custom download-head debug and derived policy debug both expose the full signature string.
- `1a4e8f541e3017f0e666935c3e003027b871d131` replaces policy derived debug with bounded custom formatting and redacts the signature field in both transport policy and download-head diagnostics. Signature validation, storage, equality and exact accessor behavior are unchanged.
- `027ba1474281b0ed968f039eb20073f1b7b9b2e9` adds a runtime-boundary regression requiring `ProvisionalUpdateMetadata` diagnostics to exclude the exact remote signature while its verification accessor remains byte-for-byte unchanged. The predecessor derived `Debug` violates this contract.
- `90855ccdb8ecb1a1166a6c2e614b6851ae26f662` replaces the provisional metadata derived `Debug` with bounded custom formatting. Candidate identity, declared size and canonical release URL remain diagnosable; only the full signature field becomes the fixed `<redacted-signature>` marker.

## Selected design

A private `RedactedUrl` formatter owns URL diagnostic rendering in `distribution-transport`. It does not allocate a second transport identity, modify stored state, normalize the URL, or feed back into policy decisions. URLs without a query render unchanged. URLs with a query retain the scheme/authority/path for operational diagnosis and render only a fixed redaction marker for the query component.

The query redaction is intentionally applied to both `AdmittedRedirect` and `AdmittedDownloadHead`: the first holds the URL before the follow-up request, while the second retains the same effective URL after the admitted `200`. Fixing only one would leave the same opaque query reachable from the other diagnostic surface.

Signature diagnostics use the same fixed `<redacted-signature>` marker in `ProvisionalUpdateMetadata`, `ReleaseTransportPolicy`, and `AdmittedDownloadHead`. The actual signature remains private state exposed through the exact verification accessor. This bounds normal debug output independently of the remote signature-size allowance and closes the earlier metadata-owner leak rather than relying on every downstream caller to remember not to format the provisional aggregate.

The canonical initial GitHub release URL remains visible in provisional/transport diagnostics because strict admission rejects query, fragment, whitespace, alternate authority and path-like asset syntax before the value exists in these types. That bounded URL is operationally useful for identifying the release target. The opaque CDN query remains redacted because its contents are not part of BandScope's release identity and need not be copied into diagnostic systems.

## Claim boundary and remaining work

This repair prevents automatic Rust `Debug` output for provisional updater metadata, Distribution transport policy, redirect decisions, and final download heads from exposing full provisional signature text; transport types also omit CDN redirect query contents. It does not prove that callers never log the explicit `artifact_signature()`, `location()`, or `effective_url()` accessors. Those exact accessors remain necessary for verification/network boundaries and must be handled as transport/security data.

OWASP's Logging Cheat Sheet explicitly treats event data from other trust zones as untrusted and recommends excluding, masking, sanitizing, hashing, or encrypting data that should not be recorded directly. The fixed diagnostic markers implement that minimization at the type boundary rather than relying only on call-site discipline.

The future production HTTP adapter must avoid logging full provider redirect URLs, must still disable implicit redirects and automatic decompression, and must stream only admitted response bytes through `distribution-download`.

Remote metadata authentication, sealed-descriptor digest/signature verification, verified-artifact promotion, signer authority, packaged fault injection, and anti-replay state wiring remain separate release gates.

## References

Berners-Lee, T., Fielding, R., & Masinter, L. (2005). *Uniform Resource Identifier (URI): Generic Syntax* (RFC 3986). RFC Editor. https://www.rfc-editor.org/rfc/rfc3986

OWASP Foundation. (2026). *Logging Cheat Sheet*. OWASP Cheat Sheet Series. https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
