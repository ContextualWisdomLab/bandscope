# Analysis-dispatch source revalidation

## Problem

Project v3 restart re-admission proves that the persisted `sourceReference` still matches the app-owned `source.<extension>` before native bootstrap authority is restored. That proof can become stale while a project remains open. Before this change, `start_analysis_job` reused the previously stored transient `source_path` without rechecking the retained Resource Admission byte identity, so a same-size mutation after load could reach the decoder under stale authority.

## Constraints

- Resource Admission remains the owner of local-audio byte identity; Project Persistence remains the owner of durable `sourceReference`; the analysis adapter consumes both without minting a second digest contract.
- Renderer IPC supplies only the BandScope project id for local audio. It cannot submit a path, byte count, digest, artifact name, or `localSource` payload.
- The current app-owned artifact must reproduce the retained bounded size and SHA-256 through the existing no-follow/reparse-aware native opener before a job is queued.
- Operating-system path and I/O details must collapse to the stable buyer-facing re-selection message.
- This is a dispatch-time freshness check, not descriptor-to-decoder continuity. The child analysis process still opens the returned transient path after the verified native reader has been released.

## RED evidence

`90f60a744f5dec46f364ae8d3c5e401af68983b7` adds `analysis_dispatch_revalidation.rs`. The contract requires unchanged app-owned bytes to regain dispatch authority and a same-size byte mutation to fail before analysis dispatch. The RED references a not-yet-existing `analysis_source` adapter, so its predecessor cannot compile that contract. An immediate descendant was pushed; no hosted RED failure receipt is claimed.

The deterministic twelve-byte RIFF/WAVE fixture tests content identity only. It is not MIR, decoder-quality, or production scientific acceptance evidence.

## Selected design

`ae1f568591c9b9901ef2331f91068a6e1f91d561` introduces the GUI-independent `revalidate_local_audio_bootstrap_for_analysis` adapter. It projects the retained `LocalAudioPublicationIdentity` through the existing Project Persistence source-reference ACL, reopens only the fixed app-owned artifact through the injected native opener, and reuses the existing bounded re-admission verifier. On success it refreshes only transient source path/extension/size fields; it does not create durable evidence.

`b84ed0e39d533ef5524d25c7d86bc0fcf0197d16` wires the adapter into the production `start_analysis_job` command. The command now obtains the project-keyed native publication identity, revalidates current bytes before filling `local_source`, and fails with `NotFound` plus the existing re-selection message when the native identity or current artifact cannot be re-established. `f5730fd0c237b02259cf25cf5570cbc0987a92c3` is a formatting/borrow-check-safe cleanup of the focused regression test; it does not alter the product contract.

## Rejected alternatives

**Trust restart verification for the lifetime of the open project.** Rejected because native bootstrap state is cached and can outlive later file mutation.

**Let the renderer resubmit a digest immediately before analysis.** Rejected because renderer data is not Resource Admission authority and would recreate the source-evidence forgery path already removed from v3 Save.

**Rehash through a second analysis-specific implementation.** Rejected because the canonical bounded receipt verifier and source-reference ACL already exist. The dispatch adapter composes those contracts instead of creating another hash/file-size policy.

**Claim strict byte continuity after the dispatch check.** Rejected because the child decoder still performs a later pathname open. The residual interval is smaller but non-zero.

## Security Notes

### Attack surface and trust boundary

The renderer-visible project id is a selector only. Native `LocalAudioPublicationIdentityState` supplies the path-free expected identity, and native bootstrap state supplies the app-owned project root. The adapter requires both to name the same BandScope project and derives the fixed artifact from canonical identity fields.

### Mitigations

The same no-follow/reparse-aware Project Persistence opener used for restart re-admission is invoked again immediately before queue admission. Exact size and SHA-256 are rechecked with the existing expected-length-plus-one-byte-growth bound. Failure occurs before `parsed_request.local_source` receives dispatch authority.

### Safe failure

Missing retained identity, project mismatch, malformed identity, native open failure, growth, truncation, or same-size mutation returns `Analysis job source was not found. Choose local audio again.` and the job is not queued. Raw filesystem diagnostics do not cross into buyer-facing status.

### Test points

`apps/desktop/src-tauri/tests/analysis_dispatch_revalidation.rs` covers exact-byte success and same-size mutation failure at the dispatch adapter. Existing restart re-admission tests remain canonical for malformed durable evidence, root substitution, no-follow/reparse behavior, growth, truncation, and exact SHA-256 identity.

### Remaining risk

The verified descriptor is released before the Python analysis process opens `local_source.sourcePath`. A local replacement or mutation in that interval can therefore still create a TOCTOU gap. Release-grade byte continuity requires a descriptor/capability-bound decoder handoff or an equivalent supported-platform immutable-snapshot mechanism whose identity is retained through decode. Parent-directory descriptor binding and higher-ancestor replacement remain separate filesystem-authority work.

## Standards traceability

NIST FIPS 180-4 remains the published Secure Hash Standard defining SHA-256. NIST has decided to revise the standard, but its current publication page still identifies FIPS 180-4; the announced revision has not superseded it.

NIST SP 800-218 v1.1 remains the released SSDF baseline. SP 800-218 Rev. 1 / SSDF 1.2 is still identified by NIST as an Initial Public Draft with the comment period closed on January 30, 2026. The repair follows the released SSDF principle of preventing recurrence by placing verification at the actual consuming boundary instead of relying on an earlier check.

## References

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (Federal Information Processing Standards Publication 180-4). https://doi.org/10.6028/NIST.FIPS.180-4

National Institute of Standards and Technology. (2023, March 7). *Decision to revise FIPS 180-4, Secure Hash Standard (SHS).* https://www.nist.gov/news-events/news/2023/03/decision-revise-fips-180-4-secure-hash-standard-shs

Scarfone, K., Souppaya, M., & Dodson, D. (2022). *Secure Software Development Framework (SSDF) Version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218

Booth, H., Ogata, M., Kent, K., Souppaya, M., & Dodson, D. (2025). *Secure Software Development Framework (SSDF) Version 1.2: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218 Rev. 1, Initial Public Draft). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218r1.ipd
