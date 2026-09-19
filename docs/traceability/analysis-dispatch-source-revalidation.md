# Analysis-dispatch source revalidation

## Problem

Project v3 restart re-admission proves that the persisted `sourceReference` still matches the app-owned `source.<extension>` before native bootstrap authority is restored. The first dispatch repair repeated that proof immediately before queue admission, but then released the verified native reader. The Python analysis process subsequently reopened `local_source.sourcePath`, leaving a smaller TOCTOU window in which different bytes could reach decode after the native check. Separately, analysis/feature cache workspaces were keyed from project/path/name/size rather than the retained digest, so cache provenance still depended on the no-clobber publication invariant rather than the same content identity used for admission.

## Constraints

- Resource Admission remains the owner of local-audio byte identity; Project Persistence remains the owner of durable `sourceReference`; analysis consumes the retained identity without minting a second digest contract.
- Renderer IPC supplies only the BandScope project id for local audio. It cannot submit a path, byte count, digest, artifact name, `sourceReference`, or native-admission evidence.
- Exact byte count and SHA-256 must survive the Rust-to-Python process boundary without process-global mutation because BandScope allows concurrent analysis jobs.
- The Python decoder must consume the same verified byte snapshot, not a pathname reopened after verification.
- Analysis cache and temporary stem-work namespaces must also be derived from the retained content identity so same-path/same-size content cannot alias reusable evidence.
- Operating-system path and I/O failures remain bounded; raw local paths and native diagnostics do not become buyer-facing errors.
- Deterministic RIFF/WAVE byte strings in this lane are security/unit fixtures only. They are not MIR accuracy, decoder-quality, or production scientific acceptance evidence.

## RED and repair evidence

`90f60a744f5dec46f364ae8d3c5e401af68983b7` introduced dispatch-time native revalidation. `ae1f568591c9b9901ef2331f91068a6e1f91d561` composed the retained `LocalAudioPublicationIdentity` with the Project Persistence reverse ACL, and `b84ed0e39d533ef5524d25c7d86bc0fcf0197d16` wired it into `start_analysis_job`. That repair narrowed the stale interval but did not bind decoder bytes.

`9dc5336d7bbd4673f4ba0722a1548596d3085bfa` adds the decoder-bound RED contracts. They require a same-size replacement to fail before decode and require decoding to continue from already-verified bytes even when the pathname changes after snapshot creation. The predecessor had no `separate_admitted` boundary, so no hosted RED receipt is claimed.

`93d2c99aef316fa42b8796b3b05bfea2cd46c7ed` adds the explicit admitted-source snapshot path. `65baf71db5ea47b607753a297908483900be9215` then adds a second RED requiring the production `AudioStemSeparator.separate` entrypoint to consume process-scoped native evidence and to reject a partial evidence pair. `e0bec865005e4e4b836fe76af66a6587d9f5743d` implements that fail-closed adapter.

`404586a2eae752fa329dfc87768b22148ce9411a` adds the Rust-side process-handoff RED. `a0809cdee41100296e478c18653ab1e7f3305559` passes the retained byte count and SHA-256 only on the spawned analysis `Command`, first removing any inherited values so demo/manual jobs cannot accidentally consume ambient evidence. It does not call process-global `std::env::set_var`, so the two allowed in-flight jobs cannot overwrite each other's identity evidence.

`cbaaf868f7fa6d1050b62eec109bdb54d69e07d0` adds the CLI RED proving that a native-admitted job must not run the earlier temporary `TemporalAnalyzer` pathname probe. `a1136c5270cfbd940d9e3e3cea7cc55b6ce1cdb9` skips that compatibility-only probe whenever native evidence is scoped, leaving the content-bound separator as the first production audio decode path. `e1b50929f7d112cf8fb417ede97c98af6a3c2b41` pins the child-process environment contract; `88beb62d7f1cad5fc141b73da0c7f75ec9d785fe` is formatting-only.

`19c2112fea48c55a17faf045c81447456cd370b5` adds a cache/temp provenance RED: a successfully revalidated source must receive cache and temporary work roots namespaced by the canonical SHA-256. `063164e93b7ba9d93ec29648c9d2d8d1a203d488` implements that in the native dispatch adapter, before the roots enter the Python request. Existing Python cache/stem-work keying therefore remains compatible while its parent namespace is content-bound.

## Selected design

The selected design is an identity-equivalent immutable snapshot rather than cross-platform descriptor inheritance.

1. `start_analysis_job` obtains the project-keyed native `LocalAudioPublicationIdentity` and revalidates the current app-owned source through the existing no-follow/reparse-aware native opener.
2. That revalidation also derives content-addressed cache/temp roots beneath the already app-owned project workspaces using the canonical SHA-256.
3. The worker receives the same retained identity. `run_analysis_engine` removes inherited BandScope admission variables, then sets exact `file_size_bytes` and `content_sha256` only on that job's child `Command`.
4. The Python CLI skips the compatibility temporal pathname probe when either native evidence variable is present. A partial pair therefore reaches the separator and fails closed rather than silently falling back to an unverified decode.
5. `AudioStemSeparator.separate` validates the canonical evidence pair, opens the selected source once, checks descriptor size, copies exactly the expected number of bytes into a private `SpooledTemporaryFile` while hashing them, performs a one-byte growth probe, and compares SHA-256.
6. Only a matching snapshot is rewound and passed to the existing `decode_mono_audio` `BinaryIO` boundary. Later pathname replacement cannot change the encoded bytes consumed by decoder/MIR/model work for that analysis invocation.

This keeps BandScope audio truth in BandScope and reuses Resource Admission identity rather than adding a second digest owner. The environment variables are a per-process native-to-analysis capability envelope, not renderer API, durable project schema, provider configuration, or cross-service state. Cache/temp scoping is native-derived and does not require Python to become a second owner of publication identity.

## Rejected alternatives

**Trust restart or dispatch verification until decode.** Rejected because CWE-367 describes exactly the failure mode where a resource can change between check and use.

**Let the renderer carry the digest into the analysis request.** Rejected because renderer data is not Resource Admission authority and would recreate the source-evidence forgery path removed from Project v3 Save.

**Mutate the desktop process environment before spawning Python.** Rejected because `MAX_IN_FLIGHT_JOBS` permits concurrent jobs; process-global mutation would create a cross-job race.

**Pass only the transient pathname and rehash it independently in Python.** Rejected because it would duplicate the digest contract and still permit another pathname read after the check.

**Key cache only by path and byte count.** Rejected because reproducible scientific evidence should not depend on the assumption that a pathname has never been rebound to same-size content. The canonical digest now namespaces cache and stem-work roots before Python sees them.

**Require one OS descriptor inheritance mechanism across Windows and macOS immediately.** Rejected for this increment because platform handle inheritance semantics differ. The selected bounded snapshot is portable and ties decode bytes to the canonical native content identity without claiming that filesystem ancestry itself is descriptor-bound.

## Security Notes

### Attack surface and trust boundary

The renderer-visible project id remains a selector only. Native `LocalAudioPublicationIdentityState` owns the expected content evidence. The Rust worker scopes that evidence to one analysis child. The Python process may see the transient app-owned pathname, but it cannot promote different bytes: size, exact bounded read, growth probe, and SHA-256 must all match before decode. Reusable cache/temp artifacts are rooted beneath the same digest identity.

### Mitigations

The repair combines checks with distinct purposes. Native re-admission confirms the app-owned project/source contract immediately before queue admission. Python then creates a private content snapshot and verifies the same identity at the consuming decode boundary. The decoder reads the verified snapshot itself, eliminating the previous check-then-reopen byte gap. Content-addressed work roots prevent same-path/same-size cache aliasing without duplicating hash computation in Python.

### Realistic threats

- the app-owned source path is rebound to different same-size bytes after native revalidation but before Python opens it;
- a child receives a partial or malformed evidence pair and silently falls back to an unverified decode path;
- process-global evidence mutation causes concurrent jobs to consume another project's source identity;
- same-path/same-size replacement aliases an existing analysis or stem-work cache namespace.

### Safe failure

Missing native identity, project mismatch, native re-open failure, malformed or partial child evidence, growth, truncation, or same-size mutation fails before separation/model work. Native paths and OS diagnostics are not returned as buyer-facing detail. Existing direct/manual library callers with no native evidence retain the compatibility path; production desktop local-audio jobs always provide evidence.

### Test points

- `apps/desktop/src-tauri/tests/analysis_dispatch_revalidation.rs` covers current-byte native revalidation, digest-scoped cache/temp roots, and per-child evidence scoping without process-global environment mutation.
- `services/analysis-engine/tests/test_audio_admitted_snapshot.py` covers same-size replacement rejection, verified-snapshot decode after pathname change, production `separate` evidence consumption, and partial-evidence rejection.
- `services/analysis-engine/tests/test_cli_native_admission_boundary.py` proves native-admitted jobs do not execute the legacy temporary pathname probe.
- Existing Project Persistence restart tests remain canonical for malformed durable evidence, root substitution, final-component no-follow/reparse behavior, growth, truncation, and exact SHA-256 identity.

### Remaining risk and next causal work

Content-byte continuity and cache namespace identity are now designed end to end for the production local-audio worker, but hosted exact-head GREEN and supported-platform real-audio acceptance are still required before this becomes release evidence.

The Python path open is content-bound, not full filesystem-ancestry authority. A higher ancestor can still be replaced between native checks and Python open; different content fails the digest, but directory-handle-relative authority remains separate hardening if BandScope must prove that the bytes came from the same filesystem object rather than merely the same admitted content.

`SpooledTemporaryFile` provides bounded, automatically cleaned temporary storage and may roll larger encoded sources to an OS-managed temporary file. That temporary-copy privacy/resource behavior needs supported Windows/macOS fault-injection and crash evidence before release. It is not a durable BandScope project artifact.

The next product-causal consumer remains #1160: only after fresh full-mix decode/playback authority exists may persisted `selectedPlaybackSource` be reconciled with currently admitted stems, with missing preferred stems falling back to Full mix.

## Standards traceability

MITRE CWE-367 defines the relevant weakness as checking resource state and then using a resource whose state can change before use. Its mitigation guidance notes that merely reducing the check/use interval does not remove the underlying identity problem. The selected snapshot instead verifies and then uses the same copied bytes.

NIST FIPS 180-4 remains the published Secure Hash Standard defining SHA-256. NIST decided to revise FIPS 180-4, but the current NIST publication page still identifies FIPS 180-4 as the published standard; the announced revision has not superseded it.

Python's `tempfile` documentation identifies `SpooledTemporaryFile` as a cross-platform high-level temporary-file interface with automatic cleanup and context-manager support. BandScope relies on those lifecycle semantics only for the transient snapshot; the cryptographic acceptance rule remains BandScope-owned.

NIST SP 800-218 v1.1 remains the released SSDF baseline. The repair follows its recurrence-prevention intent by moving verification to the actual consuming boundary instead of relying on a stale earlier check.

## References

MITRE. (2026). *CWE-367: Time-of-check time-of-use (TOCTOU) race condition* (CWE 4.20). https://cwe.mitre.org/data/definitions/367.html

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (Federal Information Processing Standards Publication 180-4). https://doi.org/10.6028/NIST.FIPS.180-4

National Institute of Standards and Technology. (2023, March 7). *Decision to revise FIPS 180-4, Secure Hash Standard (SHS).* https://www.nist.gov/news-events/news/2023/03/decision-revise-fips-180-4-secure-hash-standard-shs

Python Software Foundation. (2026). *tempfile — Generate temporary files and directories* (Python 3.14.7 documentation). https://docs.python.org/3/library/tempfile.html

Scarfone, K., Souppaya, M., & Dodson, D. (2022). *Secure Software Development Framework (SSDF) Version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218
