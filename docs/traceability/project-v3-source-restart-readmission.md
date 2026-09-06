# Project v3 source restart re-admission

## Problem

Project format v3 can persist a path-free `sourceReference` after Resource Admission has materialized and verified the app-owned full-mix artifact. On restart, however, persisted evidence must not become filesystem or playback authority merely because its JSON shape is valid. A replaced, truncated, extended, or same-size-mutated `source.<extension>` must not silently regain rehearsal authority.

The Save path keeps the original user path out of durable project truth and stores `projectId`, fixed `artifactName`, admitted `extension`, bounded `fileSizeBytes`, and canonical lowercase `contentSha256`. Restart therefore needs two distinct steps: validate that durable evidence before any filesystem lookup is attempted, then re-establish native content identity only from an app-owned descriptor whose bytes reproduce the exact persisted receipt.

## Constraints

- Resource Admission owns audio byte admission and `LocalAudioPublicationIdentity`; Project Persistence owns the durable v3 document; Active Player owns fresh playback authority.
- Persisted JSON is evidence, not permission to open a path.
- Durable fields must be validated before an opener receives any derived artifact path.
- The project root must remain bound to the same BandScope project aggregate; cross-project root substitution fails closed.
- The final artifact descriptor must come from the native platform opener so O_NOFOLLOW/reparse-point and file-identity primitives are not copied into the Project Persistence ACL.
- Size is a bounded preflight, not content identity. SHA-256 equality is required for the opened bytes.
- The verifier must stop after the expected byte length plus a one-byte growth probe rather than hashing an unexpectedly large object.
- Historical projects without `sourceReference` remain without source authority; migration does not invent evidence.
- A content-identity match alone does not prove descriptor-bound parent-directory containment or audio decodability. Those remain explicit native reopen responsibilities before fresh playback authority is issued.

## RED evidence

`f1d307d415787f137660eb982614fa1f9d37f6e7` introduced the executable core content-identity contract. It requires exact persisted WAV bytes to regain native publication identity and rejects same-size mutation, growth, truncation, forged artifact identity, malformed project id, and non-canonical extension evidence.

The later native-opener RED `66ed5ec328d498bae59af2814b20a16884f30bae` required restart code to stop at the canonical no-follow opener boundary rather than reconstructing an ambient pathname. That first contract deliberately could not compile on its predecessor because no project-root re-admission adapter existed. During the fix the responsibility was placed in the GUI-independent Project Persistence/Resource Admission ACL rather than duplicating platform open primitives in Tauri.

The deterministic PCM WAV bytes used by the core contract are unit fixtures only. The opener integration fixture validates filesystem authority composition, not MIR or decoder quality. Neither is production scientific acceptance; rights-cleared real decoded audio remains required for release acceptance.

## Selected design

`823cd4aea009a3d0904cc9710971c70389dd6ad4` added `re_admit_local_audio_publication(reference, reader)`, with `54390ce88fa6f082171682dc6d32ac5aa4a8cfe3` exporting the reverse content ACL. Current predecessor hardening through `e1158119a73a357956d042bb3d0bd977ababef8d` proves malformed evidence is rejected before reading and that native read failures collapse to the bounded workspace diagnosis.

`f36996f251e0fdbe300df6f525d2b64fff785f3a` adds `re_admit_local_audio_publication_from_project_root(project_root, reference, open_file)` and the transient `ReAdmittedLocalAudioPublication` value object. `c7e112fa4da9f28ad886cdd21afa83ac6a7a3846` exports that ACL from the canonical desktop-core root. The adapter validates the durable reference first, requires the supplied project root basename to match the same `projectId`, derives the lookup only from the validated fixed `source.<extension>` identity, and then asks the injected native opener for a descriptor. Only that opened stream is hashed and compared with the persisted bounded receipt.

The native integration coverage finalized through `909d54f64889b977dc1b7e7eba10999f503005a9` composes this ACL with the existing `project_persistence::open_project_file` authority. It verifies an exact regular app-owned source can be re-admitted, traversal-like durable artifact evidence is rejected before an opener is invoked, and a Unix symlink at the final `source.wav` component is refused by no-follow handle acquisition. Core coverage in `b975843d57a6642fe54c36e242693473f8d25852` also proves a project-root mismatch fails before filesystem authority is requested.

The resulting runtime value contains a transient app-owned `source_path` plus the path-free `LocalAudioPublicationIdentity`. The path exists only to let native runtime code rebuild bootstrap/decoder authority; it is not serializable project truth and must never be copied back into `sourceReference`.

## Rejected alternatives

**Trust the persisted digest after schema validation.** Rejected because a syntactically valid digest only states what bytes are expected; it does not prove the current app-owned artifact still contains those bytes.

**Accept `artifactName` as a pathname.** Rejected because typed durable data is still untrusted. The adapter first reconstructs the canonical Resource Admission identity and derives the fixed artifact name from the admitted extension; forged path-like text fails before the opener is invoked.

**Copy O_NOFOLLOW/reparse-point logic into the reverse ACL.** Rejected because `project_persistence::open_project_file` already owns the supported-platform final-component handle primitive and native file-identity checks. The reverse ACL injects that authority instead of creating a second security implementation.

**Compare only file size.** Rejected because same-size replacement is a realistic integrity failure and is explicitly covered by the executable contract.

**Hash until EOF without the persisted bound.** Rejected because a corrupted or replaced object could force unnecessary I/O before mismatch is known. The existing verifier reads the expected bytes and one growth probe.

**Issue playback authority immediately after hash equality.** Rejected because content identity does not establish descriptor-bound parent location authority, decoder acceptance, or current playable-stem availability.

## Security Notes

### Attack surface and trust boundary

The `.bscope` document and renderer-visible data are untrusted. `sourceReference` crosses Project Persistence as passive evidence. The reverse ACL validates every durable identity field before any filesystem opener is called. Tauri supplies the app-local project root; the ACL requires that root to remain bound to the same BandScope project id and derives only the canonical app-owned source artifact below it.

### Allowlist and validation

The Resource Admission identity builder validates the BandScope project-id grammar, admitted extension allowlist, fixed `source.<extension>` artifact name, positive bounded size, and canonical lowercase 64-hex SHA-256 representation. The project-root adapter reuses those canonical rules and additionally rejects a root whose final component does not equal the validated project id.

### Mitigations

Project Persistence supplies path-free durable evidence; the project-root ACL validates that evidence and derives one fixed source path; the injected native opener establishes supported-platform final-component no-follow/reparse and file-identity authority; Resource Admission verifies the opened bytes against the persisted bounded receipt. This sequencing prevents malformed durable data from reaching filesystem lookup and keeps platform security primitives single-owned.

### Safe failure

Malformed durable evidence, forged artifact names, cross-project root substitution, opener failure, size changes, growth, truncation, and SHA-256 mismatch all return the bounded project-workspace diagnosis. No failed re-admission returns native source identity or playback capability.

### Logging and privacy

The reverse ACL never receives the original user-selected path. SHA-256 remains purpose-bound integrity metadata. Buyer-facing failure must not expose the derived app-owned path or raw operating-system error unless a separate diagnostics contract explicitly authorizes that disclosure.

### Test points

`apps/desktop/core/tests/local_audio_restart_readmission.rs` covers exact-byte success, same-size mutation, growth, truncation, forged artifact identity, malformed durable identity, bounded read failure, exact fixed-path derivation, and cross-project-root rejection. `apps/desktop/src-tauri/tests/project_persistence_open_authority.rs` composes the new root adapter with the canonical native opener for regular-file success, pre-open traversal rejection, and Unix final-component symlink refusal. Existing Resource Admission tests remain canonical for bounded copy/publication receipts, known-answer SHA-256 vectors, maximum-size enforcement, and staging/publication failure separation.

### Realistic threats

Relevant threats are local project corruption after reported Save, same-size replacement of `source.<extension>`, truncation or append caused by interrupted or external writes, tampered `.bscope` identity fields, attempts to smuggle traversal-like artifact names, substitution of a different project root, and final-component link/reparse redirection. Hash equality is not treated as protection against a privileged attacker who can modify both the project document and app-owned artifact; that stronger local-compromise model requires separate platform storage and integrity controls.

### Remaining risk

The reusable native boundary now exists, but production Tauri `load_project` is not yet wired to it. Before v3 source persistence is release-ready, `load_project` must derive the app-local project root without creating or following a replacement project directory, call `re_admit_local_audio_publication_from_project_root` with the canonical no-follow opener, restore `LocalAudioPublicationIdentityState` and fresh `ProjectBootstrapSummaryPayload`, and then let applicable decode/admission establish runtime analysis/playback authority. Descriptor-bound parent-directory authority remains a known gap: O_NOFOLLOW protects the final source component, but a raced parent replacement needs a directory-handle-relative design or equivalent platform primitive. Restart fault injection, Active Player source reconciliation, and rights-cleared Windows/macOS real-audio acceptance also remain required evidence.

## Standards traceability

NIST FIPS 180-4 remains the published Secure Hash Standard defining SHA-256. NIST has decided to revise FIPS 180-4, including removal of SHA-1 and updated guidance, but the replacement has not superseded FIPS 180-4 as of this record.

The implementation follows the released NIST SSDF 1.1 principle of addressing root causes through explicit development and verification controls. NIST SP 800-218 Rev. 1 / SSDF 1.2 remains an Initial Public Draft; its public-comment period closed on January 30, 2026, so it is tracked as a draft rather than substituted for the released 1.1 baseline.

## References

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (Federal Information Processing Standards Publication 180-4). https://doi.org/10.6028/NIST.FIPS.180-4

National Institute of Standards and Technology. (2023, March 7). *Decision to revise FIPS 180-4, Secure Hash Standard (SHS).* https://www.nist.gov/news-events/news/2023/03/decision-revise-fips-180-4-secure-hash-standard-shs

Scarfone, K., Souppaya, M., & Dodson, D. (2022). *Secure Software Development Framework (SSDF) Version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218

Booth, H., Ogata, M., Kent, K., Souppaya, M., & Dodson, D. (2025). *Secure Software Development Framework (SSDF) Version 1.2: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218 Rev. 1, Initial Public Draft). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218r1.ipd
