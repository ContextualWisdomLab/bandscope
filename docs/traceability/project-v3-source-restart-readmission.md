# Project v3 source restart re-admission

## Problem

Project format v3 can persist a path-free `sourceReference` after Resource Admission has materialized and verified the app-owned full-mix artifact. On restart, however, persisted evidence must not become filesystem or playback authority merely because its JSON shape is valid. A replaced, truncated, extended, or same-size-mutated `source.<extension>` must not silently regain rehearsal authority.

The preceding Save path already keeps the original user path out of durable project truth and stores `projectId`, fixed `artifactName`, admitted `extension`, bounded `fileSizeBytes`, and canonical lowercase `contentSha256`. The missing reverse boundary is to re-establish native content identity from those persisted claims only after an app-owned stream reproduces the exact bytes described by the reference.

## Constraints

- Resource Admission owns audio byte admission and `LocalAudioPublicationIdentity`; Project Persistence owns the durable v3 document; Active Player owns fresh playback authority.
- Persisted JSON is evidence, not permission to open a path.
- The reverse boundary must consume an already-authorized `Read`, not a user-controlled pathname.
- Size is a bounded preflight, not content identity. SHA-256 equality is required for the opened bytes.
- The verifier must stop after the expected byte length plus a one-byte growth probe rather than hashing an unexpectedly large object.
- Historical projects without `sourceReference` remain without source authority; migration does not invent evidence.
- A content-identity match alone does not prove filesystem containment or audio decodability. The native reopen adapter must separately establish regular/no-link/reparse descriptor authority and applicable decode/admission before fresh runtime authority is issued.

## RED evidence

`f1d307d415787f137660eb982614fa1f9d37f6e7` adds the executable core contract `local_audio_restart_readmission.rs`. The predecessor has no `re_admit_local_audio_publication` API, so the contract cannot compile there.

The contract uses a tiny deterministic PCM WAV byte sequence solely as a unit fixture. It requires exact bytes to regain native publication identity and rejects:

- a one-byte mutation that preserves the total file size;
- appended bytes;
- truncation;
- a forged `../source.wav` artifact name;
- malformed project-id and non-canonical extension evidence.

This fixture is not scientific or release acceptance evidence. Rights-cleared real decoded audio remains required for production audio acceptance.

## Selected design

`823cd4aea009a3d0904cc9710971c70389dd6ad4` adds `re_admit_local_audio_publication(reference, reader)` in the GUI-independent desktop core. `54390ce88fa6f082171682dc6d32ac5aa4a8cfe3` exports it from the single crate root. `3389786dba2472160c97ea1bed92d4a16015680d` removes redundant identity reconstruction; current edge coverage is completed through `cbfc23f793917189f1893523d6bf469ea60cf6c1`.

The reverse ACL performs two distinct checks:

1. Reconstruct expected Resource Admission identity from the durable project id, admitted extension, byte length, and SHA-256. The fixed artifact name derived by Resource Admission must exactly match persisted `artifactName`.
2. Pass the already-opened stream to the canonical bounded publication-receipt verifier. The stream must reproduce the exact byte count and SHA-256; growth, truncation, read failure, or same-size content mismatch fails closed.

The result is a path-free `LocalAudioPublicationIdentity`. It is not a playback URL, local path, or file handle and cannot by itself authorize access to any filesystem object.

## Rejected alternatives

**Trust the persisted digest after schema validation.** Rejected because a syntactically valid digest only states what bytes are expected; it does not prove the current app-owned artifact still contains those bytes.

**Re-open a persisted path in the core function.** Rejected because v3 intentionally carries no path, and accepting one would collapse Project Persistence evidence into Resource Admission filesystem authority.

**Compare only file size.** Rejected because same-size replacement is a realistic integrity failure and is explicitly covered by the RED contract.

**Hash until EOF without the persisted bound.** Rejected because a corrupted or replaced object could force unnecessary I/O before mismatch is known. The existing verifier reads the expected bytes and one growth probe.

**Issue playback authority immediately after hash equality.** Rejected because content identity does not establish final-component no-link/reparse containment, descriptor-bound location authority, decoder acceptance, or current playable-stem availability.

## Security Notes

### Attack surface and trust boundary

The `.bscope` document and renderer-visible data are untrusted. `sourceReference` crosses Project Persistence as passive evidence. Native code must derive the only permitted artifact name from the validated admitted extension and must open it under BandScope's app-owned project namespace before calling the reverse ACL.

### Allowlist and validation

The existing Resource Admission identity builder validates the BandScope project-id grammar, admitted extension allowlist, fixed `source.<extension>` artifact name, positive bounded size, and canonical lowercase 64-hex SHA-256 representation. The reverse ACL reuses those canonical rules rather than duplicating them in Project Persistence.

### Mitigations

The content boundary is split deliberately: Project Persistence supplies only path-free durable evidence; the native filesystem adapter must establish containment and an opened regular descriptor; Resource Admission then verifies the opened bytes against the persisted bounded receipt. The fixed artifact-name derivation, one-byte growth probe, exact SHA-256 comparison, and absence of a pathname parameter prevent the reverse ACL from turning project JSON into ambient filesystem authority.

### Safe failure

Malformed durable evidence, forged artifact names, read errors, size changes, growth, truncation, and SHA-256 mismatch all return the bounded project-workspace diagnosis. No failed re-admission returns native source identity or playback capability. The native reopen adapter must additionally fail closed on missing/non-regular/linked/reparsed artifacts or decode/admission failure.

### Logging and privacy

The reverse ACL does not receive or log the original user-selected path. SHA-256 remains purpose-bound integrity metadata. Buyer-facing failure must not expose the derived app-owned path or raw operating-system error unless a separate diagnostics contract explicitly authorizes that disclosure.

### Test points

`apps/desktop/core/tests/local_audio_restart_readmission.rs` executes exact-byte success plus same-size mutation, growth, truncation, forged artifact, malformed project-id, and non-canonical extension failures. Existing Resource Admission tests remain the canonical coverage for bounded copying, publication receipt generation, read/write failure separation, digest known-answer vectors, and maximum-size enforcement.

### Realistic threats

Relevant threats are local project corruption after a reported Save, same-size replacement of `source.<extension>`, truncation or append caused by interrupted or external writes, tampered `.bscope` identity fields, and attempts to smuggle traversal-like artifact names through typed but untrusted durable data. Hash equality is not treated as protection against a privileged attacker who can modify both the project document and app-owned artifact; that stronger local-compromise model requires separate platform storage and integrity controls.

### Remaining risk

The production Tauri `load_project` adapter is not yet wired to this reverse ACL. Before v3 source persistence is release-ready it must derive only the app-owned artifact, acquire a regular no-link/reparse descriptor with appropriate containment/identity checks, call the reverse ACL, run applicable decode/admission, restore fresh bootstrap/native identity state, and only then allow Active Player to resolve persisted source intent against current availability. Descriptor-bound parent authority, restart fault injection, and rights-cleared Windows/macOS real-audio acceptance remain separate required evidence.

## Standards traceability

NIST FIPS 180-4 remains the published Secure Hash Standard defining SHA-256. NIST has decided to revise FIPS 180-4, including removing SHA-1 and updating guidance, but the replacement standard has not superseded FIPS 180-4 as of this decision record. This use of SHA-256 is an integrity equality check and does not claim FIPS 140 module validation or CAVP validation.

The implementation also follows the released NIST SSDF 1.1 principle of addressing root causes through explicit development and verification controls. NIST SP 800-218 Rev. 1 / SSDF 1.2 remains an Initial Public Draft rather than the released normative baseline used here.

## References

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (Federal Information Processing Standards Publication 180-4). https://doi.org/10.6028/NIST.FIPS.180-4

National Institute of Standards and Technology. (2023, March 7). *Decision to revise FIPS 180-4, Secure Hash Standard (SHS).* https://www.nist.gov/news-events/news/2023/03/decision-revise-fips-180-4-secure-hash-standard-shs

Scarfone, K., Souppaya, M., & Dodson, D. (2022). *Secure Software Development Framework (SSDF) Version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218

Booth, H., Ogata, M., Kent, K., Souppaya, M., & Dodson, D. (2025). *Secure Software Development Framework (SSDF) Version 1.2: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218 Rev. 1, Initial Public Draft). National Institute of Standards and Technology. https://csrc.nist.gov/pubs/sp/800/218/r1/ipd
