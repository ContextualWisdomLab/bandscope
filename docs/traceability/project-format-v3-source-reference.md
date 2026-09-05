# Project format v3: app-owned audio source reference

## Problem

Project format v2 can persist the Active Player selection semantic, but it cannot identify the admitted full-mix artifact needed after the desktop process restarts. The current mounted reopen path therefore recovers the song while clearing its bootstrap/source authority. Persisting the existing absolute `sourcePath` or a revocable `bandscope-playback` URL would make a user filesystem path or runtime capability part of durable project truth.

## Constraints

- Project Persistence owns the `.bscope` schema and migrations; Resource Admission owns audio admission/materialization; Active Player owns playback selection and fresh runtime authority resolution.
- Historical projects must migrate deterministically. Missing evidence must stay missing rather than being inferred.
- A durable source handle must not contain a user filesystem path, WebView storage key, generation token, or runtime playback URL.
- Renderer and file input are untrusted and must remain passive JSON data.
- The source handle has to be sufficient for a later native re-admission implementation to derive an app-owned artifact without cross-service SQL or another writable authority.

## RED evidence

`3191f3865a78cf7a19babe3e611a3d07903787de` added the native contract test `project_format_v3_source_reference.rs`. The predecessor could not compile or admit the required `ProjectSourceReferencePayload` because the current format was still version 2 and `ProjectDocumentPayload` had no source-reference field.

`6acd761f8a25b904352b2ae4eebcbc4f61ec5a48` extended the renderer/native bridge test with the same source-reference shape. The predecessor TypeScript parser admitted only `song` and `preferences`, so the new current-document payload was rejected.

A fresh post-change sweep then found a separate migration-test regression before hosted CI could be treated as evidence: `project_format_v2_playback_preference.rs` still hard-coded serialized version `2` and directly constructed `ProjectDocumentPayload` without the new optional field. That was not a product-format rollback signal; it was predecessor test code that had not been migrated with the format owner. `ace91a29e540919d02716dd492e290f9743422a8` updates those assertions to `CURRENT_PROJECT_FORMAT_VERSION`, explicitly checks that historical migrations do not invent `sourceReference`, and adds `source_reference: None` to the typed constructor. This repair preserves the v2 input compatibility contract while making current-output expectations version-aware.

## Selected design

Version 3 adds an optional `sourceReference`:

```json
{
  "projectId": "project-400-4",
  "artifactName": "source.wav",
  "extension": "wav",
  "fileSizeBytes": 4096
}
```

The contract accepts only:

- the existing opaque `project-<digits>-<digits>` namespace minted by BandScope;
- `artifactName` exactly equal to `source.<extension>`;
- one admitted extension: `wav`, `mp3`, `flac`, or `m4a`;
- a positive byte length. The renderer additionally requires a JavaScript safe integer so it cannot silently round persisted byte evidence.

The field is optional because v2/v1/legacy projects cannot prove that an app-owned source artifact exists. Their ordered migration writes version 3 with no invented reference. `selectedPlaybackSource` remains independent: it is rehearsal intent, while `sourceReference` identifies only the app-owned full-mix artifact required to rebuild native availability.

## Rejected alternatives

**Persist the original absolute path.** Rejected because it leaks local filesystem information, becomes stale when the file moves, and gives the project document filesystem authority.

**Persist `bandscope-playback://...`.** Rejected because the URL is a revocable runtime capability whose generation and availability are session-specific.

**Persist the original file name and reconstruct a path heuristically.** Rejected because it retains unnecessary user metadata and is ambiguous. The fixed `source.<extension>` artifact name is both narrower and deterministic.

**Infer a source reference while migrating v2.** Rejected because the old document carries no evidence that Resource Admission materialized an app-owned source. Fabricating one would turn a migration into a guess.

## GREEN implementation chain

- `7e315daec207c1b09ea018353abaa1c34955d7b0` — version 3 envelope, deterministic v2/v1/legacy migration, strict native source-reference validation, and current serialization.
- `90ae48e1911113cc82c5ae99a4b0f1717a0ed075` — exports the new source-reference contract from the GUI-independent crate root.
- `f54be004887c11cd7a00065b7db86510e5c83ee8` — renderer current-document source-reference type and validation.
- `04b4a93dbd7ecf5c6d3bdf4434f7908d06ffd73b` — keeps optional source-reference descriptor inspection exception-safe instead of allowing proxy traps to escape the public validation contract.
- `c1cdcd036749a0a9231682db9446e5fbbe410d40` — verifies accessor/proxy-backed source-reference input is rejected without executing getters.
- `5203c2846dd2d12a02ad54204e9c6b5197d1177f` — updates the engineering format document to the code-current v3 contract and migration boundary.
- `ace91a29e540919d02716dd492e290f9743422a8` — repairs stale v2-output expectations and typed-constructor compilation after the version advance without weakening v2 input compatibility.

Hosted exact-head checks are authoritative for repository GREEN; predecessor results are not transferable.

## Security Notes

### Attack surface and trust boundary

`.bscope` JSON and renderer IPC values are untrusted. `sourceReference` crosses into Project Persistence as data only. It does not grant permission to open an arbitrary path. Native Resource Admission remains the only owner allowed to derive and admit the corresponding app-owned audio artifact.

### Allowlist and validation

Native and TypeScript boundaries reject unknown source-reference fields. Project ids use the existing BandScope minted-id grammar. Artifact names are derived from the admitted extension and cannot contain path traversal. The extension is closed to the existing audio allowlist. Byte evidence must be positive; the renderer additionally rejects unsafe integers.

### Safe failure

Malformed references fail before project publication or before a reopened document is accepted by the renderer bridge. Historical inputs migrate without a reference rather than fabricating an authority. A future re-admission implementation must fail closed if the derived artifact is absent, non-regular, linked/reparsed, has the wrong size, or fails audio decode/admission checks.

### Logging and privacy

The durable reference intentionally excludes the original local path and original file name. Error reporting should continue using bounded/redacted buyer copy and must not add the derived app-owned path to renderer-visible diagnostics unless there is a separate explicit diagnostic contract.

### Test points

`project_format_v3_source_reference.rs` covers current round-trip, v2 migration without invention, project-id/path/artifact/extension/size rejection, and unknown `sourcePath` rejection. `project_format_v2_playback_preference.rs` keeps legacy/v1/v2 compatibility explicit while asserting current-version output and absent invented source evidence. `projectDocumentBridge.test.ts` covers the renderer/native payload boundary. `projectDocument.plainRecord.test.ts` covers passive record semantics and getter/proxy rejection.

### Remaining risk

Version 3 is a schema foundation, not completed source re-admission. Current Resource Admission still stores bootstrap source information in process memory and uses the selected external source path. The next causal slice must materialize the admitted full mix under the app-owned project namespace, write `sourceReference` only after that succeeds, and reconstruct a fresh bootstrap from the validated reference on reopen. Content digest/stronger bounded identity, cleanup/retention policy for app-owned audio, crash injection during materialization, and rights-cleared Windows/macOS real-audio acceptance remain required before this path can be called release-ready.
