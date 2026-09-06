# Project v3 source restart re-admission

## Problem

Project format v3 can persist a path-free `sourceReference` after Resource Admission has materialized and verified the app-owned full-mix artifact. On restart, persisted evidence must not become filesystem or playback authority merely because its JSON shape is valid. A replaced, truncated, extended, or same-size-mutated `source.<extension>` must not silently regain rehearsal authority.

The Save path keeps the original user path out of durable project truth and stores `projectId`, fixed `artifactName`, admitted `extension`, bounded `fileSizeBytes`, and canonical lowercase `contentSha256`. Restart therefore needs three distinct steps: validate durable evidence before any filesystem lookup, resolve only an already-existing app-local project aggregate without provisioning a replacement directory, then re-establish native content identity only from an app-owned descriptor whose bytes reproduce the exact persisted receipt.

## Constraints

- Resource Admission owns audio byte admission and `LocalAudioPublicationIdentity`; Project Persistence owns the durable v3 document; Active Player owns fresh playback authority.
- Persisted JSON is evidence, not permission to open a path.
- Durable fields must be validated before an opener receives any derived artifact path.
- The app-local project root must already exist, remain a real directory rather than a symlink/reparse point, and remain bound to the same BandScope project aggregate. Reopen must never call the provisioning path for that root.
- The final artifact descriptor must come from the native platform opener so O_NOFOLLOW/reparse-point and file-identity primitives are not copied into the core reverse ACL.
- Size is a bounded preflight, not content identity. SHA-256 equality is required for the opened bytes.
- The verifier must stop after the expected byte length plus a one-byte growth probe rather than hashing an unexpectedly large object.
- Historical projects without `sourceReference` remain without source authority; migration does not invent evidence or provision a project root.
- A content-identity match alone does not prove descriptor-bound parent-directory containment, future path stability, audio decodability, or current playable-stem availability. Those remain explicit runtime responsibilities before playback authority is issued.

## RED evidence

`f1d307d415787f137660eb982614fa1f9d37f6e7` introduced the executable core content-identity contract. It requires exact persisted WAV bytes to regain native publication identity and rejects same-size mutation, growth, truncation, forged artifact identity, malformed project id, and non-canonical extension evidence.

The later native-opener RED `66ed5ec328d498bae59af2814b20a16884f30bae` required restart code to stop at the canonical no-follow opener boundary rather than reconstructing an ambient pathname. That first contract deliberately could not compile on its predecessor because no project-root re-admission adapter existed. During the fix the responsibility was placed in the GUI-independent Project Persistence/Resource Admission ACL rather than duplicating platform open primitives in Tauri.

`ece508c6bddd42da06ba0a0278c1baf9d1fd2949` added the next realistic filesystem RED: reopen must resolve an already-existing regular project directory, reject a missing project root without creating it, and refuse a linked project directory. The first RED intentionally referenced a not-yet-existing read-side resolver; `f7e868564ac4fb88953b660709b96dee40b604e9` introduced that resolver and `b2fb79833ca917084777c206808d0a67a7be1bdc` bound the executable tests to its final Tauri adapter module.

`9cd4681ccc8fb1f1ed9e5cacc9f6da5e12086f06` then required the production `load_project` command itself to receive native app/state authority and invoke one restart adapter before returning a persisted v3 document. That predecessor had the reusable core ACL but no production call site, so the contract failed by construction until the following production fix.

The deterministic PCM/WAV-like bytes used by the core and native filesystem contracts are unit fixtures only. They validate bounded content identity and filesystem authority composition, not MIR or decoder quality. They are not production scientific acceptance; rights-cleared real decoded audio remains required for release acceptance.

## Selected design

`823cd4aea009a3d0904cc9710971c70389dd6ad4` added `re_admit_local_audio_publication(reference, reader)`, with `54390ce88fa6f082171682dc6d32ac5aa4a8cfe3` exporting the reverse content ACL. Hardening through `e1158119a73a357956d042bb3d0bd977ababef8d` proves malformed evidence is rejected before reading and native read failures collapse to the bounded workspace diagnosis.

`f36996f251e0fdbe300df6f525d2b64fff785f3a` adds `re_admit_local_audio_publication_from_project_root(project_root, reference, open_file)` and the transient `ReAdmittedLocalAudioPublication` value object. `c7e112fa4da9f28ad886cdd21afa83ac6a7a3846` exports that ACL from the canonical desktop-core root. The adapter validates the durable reference first, requires the supplied project root basename to match the same `projectId`, derives the lookup only from the validated fixed `source.<extension>` identity, and then asks the injected native opener for a descriptor. Only that opened stream is hashed and compared with the persisted bounded receipt.

Native opener coverage through `909d54f64889b977dc1b7e7eba10999f503005a9` verifies an exact regular app-owned source can be re-admitted, traversal-like durable artifact evidence is rejected before an opener is invoked, and a Unix symlink at the final `source.wav` component is refused by no-follow handle acquisition. Core coverage in `b975843d57a6642fe54c36e242693473f8d25852` also proves a project-root mismatch fails before filesystem authority is requested.

The read-side resolver introduced at `f7e868564ac4fb88953b660709b96dee40b604e9` is deliberately distinct from `app_owned_root`. It validates the BandScope project id, derives the app-local child, requires that child to already exist as a real directory rather than a symlink or Windows reparse point, and never invokes `create_dir_all`. Cache and temp workspaces remain provisionable runtime resources, but production reopen creates them only after the persisted source has passed project-root and exact-byte re-admission.

Production integration `0f20b072a245feca59c72ac29b21968b41982f46` wires this sequence into `load_project`. After recovery and bounded project parsing, a v3 document with `sourceReference` resolves the existing app-local project root, reopens the fixed source through `project_persistence::open_project_file`, verifies exact byte length and SHA-256, provisions cache/temp runtime roots, and atomically acquires both native state locks before restoring `LocalAudioPublicationIdentityState` and the matching `ProjectBootstrapSummaryPayload`. A legacy document without `sourceReference` returns without inventing source authority. `ddeff8b48b59ef9e43804d9cd6a569ee2c4aefbb` is formatting-only follow-up for the new resolver.

The restored bootstrap keeps `source_path` transient in native memory. The durable document still contains no filesystem path, and renderer save IPC remains unable to author a digest, artifact name, byte count, or `sourceReference`.

## Rejected alternatives

**Trust the persisted digest after schema validation.** Rejected because a syntactically valid digest only states what bytes are expected; it does not prove the current app-owned artifact still contains those bytes.

**Reuse `app_owned_root` during load.** Rejected because that function calls `create_dir_all`. A missing or replaced project aggregate must make reopen fail, not cause the read path to manufacture a directory that did not back the persisted evidence.

**Accept `artifactName` as a pathname.** Rejected because typed durable data is still untrusted. The adapter first reconstructs the canonical Resource Admission identity and derives the fixed artifact name from the admitted extension; forged path-like text fails before the opener is invoked.

**Copy O_NOFOLLOW/reparse-point logic into the core reverse ACL.** Rejected because `project_persistence::open_project_file` already owns the supported-platform final-component handle primitive and native file-identity checks. The reverse ACL injects that authority instead of creating a second core security implementation.

**Compare only file size.** Rejected because same-size replacement is a realistic integrity failure and is explicitly covered by the executable contract.

**Hash until EOF without the persisted bound.** Rejected because a corrupted or replaced object could force unnecessary I/O before mismatch is known. The existing verifier reads the expected bytes and one growth probe.

**Issue playback authority immediately after hash equality.** Rejected because content identity does not establish descriptor-bound parent location authority, future path stability, decoder acceptance, or current playable-stem availability.

## Security Notes

### Attack surface and trust boundary

The `.bscope` document and renderer-visible data are untrusted. `sourceReference` crosses Project Persistence as passive evidence. The reverse ACL validates every durable identity field before any filesystem opener is called. Tauri derives the app-local project base from its native path API; the read-side resolver requires the exact project child to pre-exist without link/reparse indirection, and the core ACL requires that child to remain bound to the same BandScope project id.

### Allowlist and validation

The Resource Admission identity builder validates the BandScope project-id grammar, admitted extension allowlist, fixed `source.<extension>` artifact name, positive bounded size, and canonical lowercase 64-hex SHA-256 representation. The project-root adapter reuses those canonical rules and additionally rejects a root whose final component does not equal the validated project id. The Tauri read-side resolver refuses missing or linked project directories rather than provisioning them.

### Mitigations

Project Persistence supplies path-free durable evidence; the read-side resolver selects only an already-existing project aggregate; the project-root ACL validates the evidence and derives one fixed source path; the injected native opener establishes supported-platform final-component no-follow/reparse and file-identity authority; Resource Admission verifies the opened bytes against the persisted bounded receipt. Native publication and bootstrap state are restored only after all those steps succeed.

### Safe failure

Malformed durable evidence, forged artifact names, cross-project root substitution, a missing or linked project root, opener failure, size changes, growth, truncation, and SHA-256 mismatch all return the bounded project-workspace diagnosis. No failed re-admission restores native publication/bootstrap state or playback capability.

### Logging and privacy

The reverse ACL never receives the original user-selected path. SHA-256 remains purpose-bound integrity metadata. Buyer-facing failure does not expose the derived app-owned path or raw operating-system error unless a separate diagnostics contract explicitly authorizes that disclosure.

### Test points

`apps/desktop/core/tests/local_audio_restart_readmission.rs` covers exact-byte success, same-size mutation, growth, truncation, forged artifact identity, malformed durable identity, bounded read failure, exact fixed-path derivation, and cross-project-root rejection. `apps/desktop/src-tauri/tests/project_persistence_open_authority.rs` composes the root ACL with the canonical native opener and now also proves the read-side project-root resolver accepts an existing regular aggregate, refuses a missing aggregate without creating it, and rejects Unix directory symlinks. `apps/desktop/src-tauri/tests/local_audio_publication_contract.rs` requires production `load_project` to restore source authority before returning the document and forbids the provisioning `app_owned_root(..., "projects", ...)` path inside that command. Existing Resource Admission tests remain canonical for bounded copy/publication receipts, known-answer SHA-256 vectors, maximum-size enforcement, and staging/publication failure separation.

### Realistic threats

Relevant threats are local project corruption after reported Save, same-size replacement of `source.<extension>`, truncation or append caused by interrupted or external writes, tampered `.bscope` identity fields, attempts to smuggle traversal-like artifact names, substitution or deletion of the persisted project root, and final-component link/reparse redirection. Hash equality is not treated as protection against a privileged attacker who can modify both the project document and app-owned artifact; that stronger local-compromise model requires separate platform storage and integrity controls.

### Remaining risk

Production `load_project` now restores verified full-mix publication identity and native bootstrap state, but it does not yet establish release-grade end-to-end playback authority. The verified file descriptor is consumed by SHA-256 verification and a transient path is retained for the later analysis process. A local mutation or replacement after verification but before the analysis/decoder opens that path is therefore a remaining time-of-check/time-of-use gap; a descriptor/capability-bound handoff or an equivalent immutable snapshot design is required before claiming strict byte continuity into decode/playback.

Descriptor-bound parent-directory authority also remains a known gap: final-component O_NOFOLLOW/reparse protection and a non-link project-root check do not prevent a concurrently replaced ancestor. A directory-handle-relative design or equivalent supported-platform primitive is required for that stronger guarantee. Restart fault injection, actual decoder re-admission, Active Player source reconciliation, preferred-stem-to-Full-mix fallback, and rights-cleared Windows/macOS real-audio acceptance remain required evidence.

## Standards traceability

NIST FIPS 180-4 remains the published Secure Hash Standard defining SHA-256. NIST has decided to revise FIPS 180-4, including removal of SHA-1 and updated guidance, but the replacement has not superseded FIPS 180-4 as of this record.

The implementation follows the released NIST SSDF 1.1 principle of addressing root causes through explicit development and verification controls. NIST SP 800-218 Rev. 1 / SSDF 1.2 remains an Initial Public Draft; its public-comment period closed on January 30, 2026, so it is tracked as a draft rather than substituted for the released 1.1 baseline.

## References

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (Federal Information Processing Standards Publication 180-4). https://doi.org/10.6028/NIST.FIPS.180-4

National Institute of Standards and Technology. (2023, March 7). *Decision to revise FIPS 180-4, Secure Hash Standard (SHS).* https://www.nist.gov/news-events/news/2023/03/decision-revise-fips-180-4-secure-hash-standard-shs

Scarfone, K., Souppaya, M., & Dodson, D. (2022). *Secure Software Development Framework (SSDF) Version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218

Booth, H., Ogata, M., Kent, K., Souppaya, M., & Dodson, D. (2025). *Secure Software Development Framework (SSDF) Version 1.2: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218 Rev. 1, Initial Public Draft). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218r1.ipd
