# Licensed demo and first-run rehearsal

A buyer who launches BandScope with no song loaded must be able to start tonight's rehearsal without locating a file, inventing MIR terminology, or leaving the device.

This package is the licensed demo slice of #964. It does **not** close the full first-run measurement program, and it does **not** invent a parallel MIR product (#828 still owns #770).

## What the buyer sees

1. Open BandScope.
2. The empty workspace names **Try the demo** and **Use my own song**.
3. Privacy copy: your audio stays on this device.
4. **Try the demo** validates the bundled original recording through the same local-audio intake as a user file, then enables **Start analysis**.
5. **Use my own song** opens the existing local-file picker.
6. Analysis is never started automatically.

Korean and English keep the same choices, limitation, and next action.

## Licensed package

Canonical files live in `apps/desktop/src-tauri/resources/demo/`:

| File | Role |
| --- | --- |
| `late-night-set.wav` | Original two-section evaluation audio (CC0 1.0) |
| `LICENSE` | CC0 1.0 waiver |
| `annotations.json` | Ground-truth verse/chorus times for later #770 evidence |
| `provenance.json` | Exact hashes, byte sizes, performer, and permitted uses |

`Late Night Set` is original Contextual Wisdom Lab audio. It is not a commercial recording. Private or copyrighted benchmark assets stay out of this public package.

After changing the source audio, regenerate `late-night-set.wav` with `scripts/generate_licensed_demo_wav.py`. Then refresh `provenance.json` with the final WAV's byte size and SHA-256, and finally update the matching SHA-256 entries in `supply-chain/supplemental-component-inventory.json` for the changed packaged assets before packaging or committing them. The inventory and provenance values must describe the final bytes that will ship.

The checked-in provenance JSON is a stable public wire contract and therefore keeps its established `song.id`, `song.title`, `song.performer`, `song.license`, and asset `path`, `role`, `sha256`, `bytes`, and `mediaType` keys. `parseDemoProvenanceManifest` is the anti-corruption boundary: after validating those wire keys, organization-owned code uses the semantic internal vocabulary `demoSong.songId`, `songTitle`, `performerName`, `licenseExpression`, and `demoAssets[].assetPath`, `assetRole`, `assetSha256`, `assetByteCount`, and `assetMediaType`. New internal consumers must not propagate the legacy generic wire names beyond that boundary.

## Production boundary

`select_demo_audio_source` resolves the bundled WAV from the Tauri resource directory, rejects missing/symlink/non-WAV/wrong-size/non-RIFF files, then reuses the same project/cache/temp bootstrap as `select_local_audio_source`. Browser fallback fails closed and tells the musician to use their own song. No mocked analysis success is presented as a production pass.

## Security Notes

- Untrusted input: bundled resource bytes plus the same local-audio bootstrap as a user-selected file.
- Trust boundary: empty-card action → allowlisted Tauri command → resource-dir lookup → size/magic/symlink checks → app-owned project roots. The provenance manifest is not a filesystem authority document and never dereferences user paths or URLs.
- Safe failure: missing or altered demo assets surface payload-free copy that names **Use my own song**. Rejected paths are not rendered.
- Privacy: no telemetry, no demo download, no network path for the bundled audio.
- Test points: provenance hash/size contract, browser fail-closed demo intake, empty-card actions, Rust size/magic/symlink rejection.

## Out of scope

- No account, cloud upload, or telemetry consent.
- No copyrighted commercial song.
- No role/goal onboarding form in this slice.
- No dependency, lockfile, or vulnerability-suppression delta. Canonical npm HIGH findings remain #783-owned.
