# Project format v3: app-owned audio source reference

## Problem

Project format v2 can persist the Active Player selection semantic, but it cannot identify the admitted full-mix artifact needed after the desktop process restarts. The current mounted reopen path therefore recovers the song while clearing its bootstrap/source authority. Persisting the existing absolute `sourcePath` or a revocable `bandscope-playback` URL would make a user filesystem path or runtime capability part of durable project truth.

The first v3 source-reference draft narrowed location authority correctly but retained only `fileSizeBytes` as content evidence. Byte length is not content identity: different audio bytes can have the same size. Treating size equality as sufficient re-admission evidence would let a replaced or corrupted app-owned source satisfy the durable reference and undermine rehearsal reproducibility.

## Constraints

- Project Persistence owns the `.bscope` schema and migrations; Resource Admission owns audio admission/materialization; Active Player owns playback selection and fresh runtime authority resolution.
- Historical projects must migrate deterministically. Missing evidence must stay missing rather than being inferred.
- A durable source handle must not contain a user filesystem path, WebView storage key, generation token, or runtime playback URL.
- Renderer and file input are untrusted and must remain passive JSON data.
- The source handle has to be sufficient for later native re-admission to derive and verify an app-owned artifact without cross-service SQL or another writable authority.
- The v3 format is still Draft/unreleased work in #970, so tightening the v3 source-reference contract before merge is preferable to publishing an underspecified same-version schema and then maintaining it as compatibility debt.

## RED evidence

`3191f3865a78cf7a19babe3e611a3d07903787de` added the native contract test `project_format_v3_source_reference.rs`. The predecessor could not compile or admit the required `ProjectSourceReferencePayload` because the current format was still version 2 and `ProjectDocumentPayload` had no source-reference field.

`6acd761f8a25b904352b2ae4eebcbc4f61ec5a48` extended the renderer/native bridge test with the same source-reference shape. The predecessor TypeScript parser admitted only `song` and `preferences`, so the new current-document payload was rejected.

A fresh post-change sweep found a separate migration-test regression before hosted CI could be treated as evidence: `project_format_v2_playback_preference.rs` still hard-coded serialized version `2` and directly constructed `ProjectDocumentPayload` without the new optional field. `ace91a29e540919d02716dd492e290f9743422a8` repairs those expectations to `CURRENT_PROJECT_FORMAT_VERSION`, verifies historical migrations do not invent `sourceReference`, and restores the typed constructor without weakening v2 input compatibility.

A later scientific/reproducibility review found that the initial v3 shape still admitted a source reference whose only content evidence was byte length. RED `39fb18192f55f2f28fdf97d8d213efad75f987e2`, refined in `ac5a080576a5ed40e0e997c6bb0ba37b90f1455d`, requires a durable source reference to carry content identity and rejects missing, shortened, uppercase, or non-hex digest representations. The predecessor accepted the digest-free shape, so this is a causal contract failure rather than a documentation-only finding.

Renderer RED `16e54784c720e048d29d545643c5928b6d1265d5` applies the same requirement across the WebView/native boundary. A renderer response that omits or weakens content identity must be rejected before it can become durable project truth.

## Selected design

Version 3 adds an optional `sourceReference`:

```json
{
  "projectId": "project-400-4",
  "artifactName": "source.wav",
  "extension": "wav",
  "fileSizeBytes": 4096,
  "contentSha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

The contract accepts only:

- the existing opaque `project-<digits>-<digits>` namespace minted by BandScope;
- `artifactName` exactly equal to `source.<extension>`;
- one admitted extension: `wav`, `mp3`, `flac`, or `m4a`;
- a positive byte length. The renderer additionally requires a JavaScript safe integer so it cannot silently round persisted byte evidence;
- a canonical lowercase 64-hex-character SHA-256 digest of the app-owned source bytes.

`fileSizeBytes` remains useful as a bounded preflight and diagnostic signal but is not accepted as content identity. `contentSha256` is the durable equality check that later Resource Admission must recompute over the re-opened app-owned artifact before creating fresh runtime authority. FIPS 180-4 defines SHA-256 as part of the Secure Hash Standard; NIST's current CAVP secure-hashing material, updated in August 2026, continues to list SHA-256 under FIPS 180-4. NIST has announced a future revision of FIPS 180-4, but that revision has not replaced the current final standard.

The field is optional because v2/v1/legacy projects cannot prove that an app-owned source artifact exists. Their ordered migration writes version 3 with no invented reference. `selectedPlaybackSource` remains independent: it is rehearsal intent, while `sourceReference` identifies only the app-owned full-mix artifact required to rebuild native availability.

The path-free shape is also a security boundary, not merely a portability choice. CWE-22 treats attacker-influenced relative/absolute pathnames as a path-traversal class, while CWE-59 covers file access that follows a link or shortcut to an unintended resource. A future reopen path must derive the artifact below the validated app-owned project root rather than trust a persisted path, re-check link/reparse and file identity at access time, verify size, recompute SHA-256, and only then re-run audio admission. These references justify the threat model; they do not constitute evidence that re-admission is already implemented.

## Rejected alternatives

**Persist the original absolute path.** Rejected because it leaks local filesystem information, becomes stale when the file moves, gives the project document filesystem authority, and reintroduces a path-traversal-shaped input at reopen.

**Persist `bandscope-playback://...`.** Rejected because the URL is a revocable runtime capability whose generation and availability are session-specific.

**Persist the original file name and reconstruct a path heuristically.** Rejected because it retains unnecessary user metadata and is ambiguous. The fixed `source.<extension>` artifact name is narrower and deterministic.

**Use byte length as content identity.** Rejected because distinct byte sequences can have identical length. Size remains a bounded preflight, not proof that the source used for rehearsal decisions is the same admitted artifact.

**Use a non-canonical or variable-length digest string.** Rejected because multiple textual forms enlarge the durable contract without benefit. The project format stores one canonical lowercase SHA-256 representation.

**Infer a source reference while migrating v2.** Rejected because the old document carries no evidence that Resource Admission materialized an app-owned source. Fabricating one would turn a migration into a guess.

## GREEN implementation chain

- `7e315daec207c1b09ea018353abaa1c34955d7b0` — version 3 envelope, deterministic v2/v1/legacy migration, strict native source-reference validation, and current serialization.
- `90ae48e1911113cc82c5ae99a4b0f1717a0ed075` — exports the new source-reference contract from the GUI-independent crate root.
- `f54be004887c11cd7a00065b7db86510e5c83ee8` — renderer current-document source-reference type and validation.
- `04b4a93dbd7ecf5c6d3bdf4434f7908d06ffd73b` — keeps optional source-reference descriptor inspection exception-safe instead of allowing proxy traps to escape the public validation contract.
- `c1cdcd036749a0a9231682db9446e5fbbe410d40` — verifies accessor/proxy-backed source-reference input is rejected without executing getters.
- `5203c2846dd2d12a02ad54204e9c6b5197d1177f` — updates the engineering format document to the code-current v3 contract and migration boundary.
- `ace91a29e540919d02716dd492e290f9743422a8` — repairs stale v2-output expectations and typed-constructor compilation after the version advance without weakening v2 input compatibility.
- `c2117f2a41e2c1db84aba6332c069dda59b5cad2` — requires canonical lowercase SHA-256 content identity in the native v3 source-reference contract.
- `7e853c5d6c40a35128afcf356536d2ca147ad109` — requires the same SHA-256 evidence in renderer admission and keeps digest/property inspection passive and fail closed.

Hosted exact-head checks are authoritative for repository GREEN; predecessor results are not transferable. The test-first/root-cause record also follows the released NIST SSDF 1.1 principle of integrating secure-development practices into the SDLC and addressing vulnerability root causes rather than treating a passing downstream check as the sole control. NIST published SSDF 1.2 only as SP 800-218 Rev. 1 Initial Public Draft in December 2025; this traceability therefore treats v1.1 as the released reference and the v1.2 draft as non-normative tracking input.

## Security Notes

### Attack surface and trust boundary

`.bscope` JSON and renderer IPC values are untrusted. `sourceReference` crosses into Project Persistence as data only. It does not grant permission to open an arbitrary path. Native Resource Admission remains the only owner allowed to derive and admit the corresponding app-owned audio artifact.

### Allowlist and validation

Native and TypeScript boundaries reject unknown source-reference fields. Project ids use the existing BandScope minted-id grammar. Artifact names are derived from the admitted extension and cannot contain path traversal. The extension is closed to the existing audio allowlist. Byte evidence must be positive; the renderer additionally rejects unsafe integers. `contentSha256` must be exactly 64 lowercase hexadecimal characters. The string is evidence to be verified, not trusted merely because its syntax is valid.

### Safe failure

Malformed references fail before project publication or before a reopened document is accepted by the renderer bridge. Historical inputs migrate without a reference rather than fabricating an authority. Re-admission must fail closed if the derived artifact is absent, non-regular, linked/reparsed, has the wrong size, has a SHA-256 mismatch, or fails audio decode/admission checks. CWE-59 specifically makes link resolution before file access part of the threat model, so lexical containment plus matching digest syntax is not sufficient acceptance evidence.

### Logging and privacy

The durable reference intentionally excludes the original local path and original file name. The SHA-256 digest is content-derived metadata and must be treated as purpose-bound project integrity evidence rather than a user identifier. Error reporting should continue using bounded/redacted buyer copy and must not add the derived app-owned path to renderer-visible diagnostics unless there is a separate explicit diagnostic contract.

### Test points

`project_format_v3_source_reference.rs` covers current round-trip, v2 migration without invention, project-id/path/artifact/extension/size rejection, unknown `sourcePath` rejection, and canonical SHA-256 requirements. `project_format_v2_playback_preference.rs` keeps legacy/v1/v2 compatibility explicit while asserting current-version output and absent invented source evidence. `projectDocumentBridge.test.ts` covers the renderer/native payload boundary, including digest presence and canonical representation. `projectDocument.plainRecord.test.ts` covers passive record semantics and getter/proxy rejection.

### Remaining risk

Version 3 is a schema/admission foundation, not completed source re-admission. Current Resource Admission still stores bootstrap source information in process memory and uses the selected external source path. The next causal slice must materialize the admitted full mix under the app-owned project namespace, compute `contentSha256` from the bytes that were actually published, write `sourceReference` only after publication and digest calculation succeed, and reconstruct a fresh bootstrap from the validated reference on reopen. Reopen must recompute SHA-256 before issuing playback authority. Cleanup/retention policy for app-owned audio, crash injection during materialization, and rights-cleared Windows/macOS real-audio acceptance remain required before this path can be called release-ready.

## References

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (Federal Information Processing Standards Publication 180-4). https://doi.org/10.6028/NIST.FIPS.180-4

MITRE. (2026). *CWE-22: Improper limitation of a pathname to a restricted directory ('Path Traversal')* (CWE Version 4.20). https://cwe.mitre.org/data/definitions/22.html

MITRE. (2026). *CWE-59: Improper link resolution before file access ('Link Following')* (CWE Version 4.20). https://cwe.mitre.org/data/definitions/59.html

Scarfone, K., Souppaya, M., & Dodson, D. (2022). *Secure Software Development Framework (SSDF) Version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218

Booth, H., Ogata, M., Kent, K., Souppaya, M., & Dodson, D. (2025). *Secure Software Development Framework (SSDF) Version 1.2: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218 Rev. 1, Initial Public Draft). National Institute of Standards and Technology. https://csrc.nist.gov/pubs/sp/800/218/r1/ipd
