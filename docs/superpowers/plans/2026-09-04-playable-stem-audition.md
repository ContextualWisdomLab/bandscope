# Playable stem audition implementation plan

> **Execution rule:** Apply test-driven development. Keep this work stacked on canonical Active Player PR #971. Do not create a second transport store, duplicate Issue #781 resource policy, or claim MIR quality from transport tests.

**Goal:** Turn BandScope's already-generated four source-separation outputs into revocable, renderer-safe media sources that the existing Active Player can actually audition one at a time.

**Architecture:** The analysis engine materializes an aligned PCM16 WAV artifact set. Tauri validates and registers the native files under the current project, rewrites the internal manifest to opaque `bandscope-project://…/stem-*` authorities, and emits only that sanitized projection. The React Active Player keeps one media element and one transport state machine while switching between the full mix and one validated stem. A synchronized Web Audio gain mixer is a later successor after timing evidence.

**Stack:** Python 3.12+ (`numpy`, standard-library `wave`), Rust 1.97.1, Tauri 2, React 19, TypeScript, Vitest, pytest, cargo test.

**Base identity at plan creation:** `feat/rehearsal-player-first-section-loop@803019e092376383500c0a4f8c2f52c68eb7232f`.

---

## Task 1: Establish the decision and traceability baseline

**Files**

- Create: `docs/adr/README.md`
- Create: `docs/adr/0001-playable-stem-delivery-and-audition.md`
- Create: `docs/superpowers/plans/2026-09-04-playable-stem-audition.md`

**Steps**

1. Record ADR-0001 as `Proposed`.
2. Bind the work to #961/#971 while preserving #770/#828, #781/#866, and #962 ownership.
3. Record the rejected independent-media-clock design and the later synchronized mixer gate.
4. Commit the documentation before implementation so reviewers can reconstruct the intended boundary.

## Task 2: Materialize aligned native WAV artifacts

**Files**

- Create: `services/analysis-engine/src/bandscope_analysis/separation/playback_artifacts.py`
- Create: `services/analysis-engine/tests/test_playback_artifacts.py`
- Modify later: `services/analysis-engine/src/bandscope_analysis/separation/__init__.py`

**RED tests**

- exact canonical stem set required;
- nonempty, one-dimensional, finite arrays required;
- every stem has the same sample count;
- sample rate is a bounded positive integer and not Boolean;
- invalid artifact-set identifiers fail closed;
- symlink or non-directory artifact roots fail closed;
- one shared gain prevents clipping without per-stem normalization;
- generated files are mono PCM16 WAV with exact sample count/rate;
- hash and byte-size metadata match on-disk bytes;
- rerunning the same artifact set is deterministic and leaves no temporary files;
- failed publication removes partial temporary files.

**GREEN implementation**

1. Validate all arrays before creating output.
2. Derive one shared gain from the set-wide peak.
3. Write each file to a same-directory temporary file.
4. flush/fsync, atomically replace the deterministic target, then hash the published bytes.
5. Return a JSON-serializable internal native manifest.
6. Run focused pytest with branch coverage, Ruff, and mypy.

## Task 3: Attach artifact production to fresh and cached analysis

**Files**

- Modify: `services/analysis-engine/src/bandscope_analysis/api.py`
- Modify: `services/analysis-engine/tests/test_api.py`
- Modify: `services/analysis-engine/tests/test_branch_coverage_contract.py`

**RED tests**

- successful separation emits a native artifact set in the terminal status;
- cached features emit the same artifact contract without invoking Demucs;
- a final-result cache hit attempts bounded feature reuse and omits stems honestly when no feature set exists;
- fallback or separation failure never emits a success-shaped stem set;
- native paths do not enter cached rehearsal-song JSON;
- artifact generation failure keeps the analysis result usable but reports stems unavailable.

**GREEN implementation**

1. Derive a deterministic artifact-set identifier from the versioned source/analysis identity.
2. Materialize artifacts after fresh separation and after feature-cache load.
3. Add an internal optional native artifact field to the analysis JSONL status.
4. Keep the final `RehearsalSong` contract free of filesystem metadata.
5. Preserve #781 resource bounds; do not add a second decoder.

## Task 4: Define and validate native/public contracts

**Files**

- Modify: `apps/desktop/core/src/lib.rs`
- Modify: `apps/desktop/core/tests/analysis_job_status.rs` or the current owning status-contract test
- Modify: `packages/shared-types/src/index.ts`
- Modify: `packages/shared-types/test/index.test.ts`

**RED tests**

- native manifest denies unknown fields and malformed values;
- public artifact source accepts only the four canonical stem kinds and opaque BandScope authorities;
- native path is rejected by the public parser;
- unknown stems, duplicates, misalignment, nonfinite duration, zero size, bad hashes, and invalid media type fail closed;
- optional absence remains compatible with old results.

**GREEN implementation**

1. Add a trusted-internal native status shape for subprocess ingestion.
2. Add a separate renderer-safe projection shape.
3. Use semantic multiword names and translate only at the IPC boundary.
4. Keep all existing analysis-job fields backward compatible.

## Task 5: Register stems with revocable Tauri playback authority

**Files**

- Modify: `apps/desktop/src-tauri/src/playback_protocol.rs`
- Modify: `apps/desktop/src-tauri/src/main.rs`
- Modify: `apps/desktop/src-tauri/build.rs` only if a command surface changes
- Modify: `apps/desktop/src-tauri/tauri.conf.json` only if CSP needs an explicit path update
- Modify: existing Rust protocol and native integration tests

**RED tests**

- mix compatibility URI remains valid;
- exact stem URIs resolve only for the active project;
- old project and old artifact-set handles are revoked;
- only GET/HEAD and one bounded byte range are accepted;
- native artifact path must be under the current project temp artifact directory;
- symlinks, file replacement, wrong size/hash/type, duplicate kind, unknown kind, and cross-project registration fail;
- a status emitted to the renderer contains opaque authorities and no native path;
- a malformed internal manifest cannot partially register a set.

**GREEN implementation**

1. Refactor the authority from one source into one current project containing a full mix plus an atomic stem-source map.
2. Preserve `/project-id` for the full mix and add strict `/project-id/stem-*` paths.
3. Register the complete validated set in one operation.
4. Rewrite or remove native fields before status storage and event emission.
5. Hold revocation protection through each bounded serve operation.

## Task 6: Connect the sanitized status to the mounted workspace

**Files**

- Modify: `apps/desktop/src/lib/analysis.ts`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/App.test.tsx`
- Modify: `apps/desktop/src/features/workspace/Workspace.tsx`
- Modify: `apps/desktop/src/features/workspace/Workspace.test.tsx`

**RED tests**

- current job and current project identity must match before stems become available;
- stale job completion cannot attach stems to a replacement song;
- no stem set leaves the existing unavailable controls enabled;
- `other` is presented as `Other instruments`, not inferred guitar or keys;
- renderer state and error copy contain no path.

**GREEN implementation**

1. Parse the public artifact set on every bridge/event boundary.
2. Store it beside the current successful job, not inside the song.
3. Clear it on source replacement, job replacement, failed analysis, and project load without matching authority.
4. Pass the sanitized set into the Active Player.

## Task 7: Add real single-source audition to Active Player

**Files**

- Modify: `apps/desktop/src/features/workspace/RehearsalPlayer.tsx`
- Modify: `apps/desktop/src/features/workspace/RehearsalPlayer.test.tsx`
- Create if useful: `apps/desktop/src/features/workspace/rehearsalPlaybackSource.ts`
- Create if useful: `apps/desktop/src/features/workspace/rehearsalPlaybackSource.test.ts`

**RED tests**

- `Full mix` remains the default source;
- only validated available stems render as source choices;
- choosing a stem changes the actual `<audio>` source;
- changing source during count-in/looping stops or re-arms deterministically and never leaves two sources playing;
- current section, loop boundaries, rate, and role filter remain coherent;
- a failed stem load returns to a truthful unavailable/error state without silently reporting playback;
- keyboard and assistive technology expose source name, selected state, and availability.

**GREEN implementation**

1. Add one source-selection value to the existing player state boundary.
2. Keep one media element and the existing transport reducer.
3. On source change, invalidate stale play promises, stop playback, load metadata, revalidate the selected loop, and re-arm it.
4. Replace the disabled `Play stem`/`Solo or mute others` affordance with the real source selector; do not add gain sliders.
5. Keep `Other instruments` explicit and localized.

## Task 8: Localize and isolate component states

**Files**

- Modify: `apps/desktop/src/i18n/en/common.json`
- Modify: `apps/desktop/src/i18n/ko/common.json`
- Modify: all other supported locale resources or keep the feature behind a locale-completeness gate
- Modify/Create: Active Player Storybook stories in the current Storybook owner
- Modify: `docs/design-system/component-contract.md`

**States**

- full mix only;
- four stems ready;
- separation unavailable;
- partial manifest rejected;
- stem media load error;
- source switch while armed;
- source switch while looping;
- narrow viewport and text expansion;
- keyboard-only and reduced motion.

Do not invent a Figma node identifier. Record the canonical Figma file and mark the node as pending live verification until an actual node exists.

## Task 9: Production QA and evidence

**Files**

- Modify: `ARCHITECTURE.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`
- Create: `docs/doctoring/playable-stem-audition.md`
- Coordinate, do not concurrently edit: `docs/product-technical-gap-baseline.md` owner PR

**Verification commands**

```bash
uv run --project services/analysis-engine pytest \
  services/analysis-engine/tests/test_playback_artifacts.py \
  services/analysis-engine/tests/test_api.py \
  --cov=services/analysis-engine/src/bandscope_analysis \
  --cov-branch --cov-report=term-missing --cov-fail-under=100

uv run --project services/analysis-engine ruff check services/analysis-engine/src services/analysis-engine/tests
uv run --project services/analysis-engine ruff format --check services/analysis-engine/src services/analysis-engine/tests
uv run --project services/analysis-engine mypy services/analysis-engine/src

npm run lint --workspace @bandscope/shared-types
npm run typecheck --workspace @bandscope/shared-types
npm run test --workspace @bandscope/shared-types
npm run lint --workspace @bandscope/desktop
npm run typecheck --workspace @bandscope/desktop
npm run test --workspace @bandscope/desktop

cargo +1.97.1 fmt --manifest-path apps/desktop/core/Cargo.toml --check
cargo +1.97.1 test --manifest-path apps/desktop/core/Cargo.toml --locked
cargo +1.97.1 test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked

./scripts/harness/quickcheck.sh
```

**Rendered QA flow**

```text
local or authorized YouTube source
→ successful analysis
→ four real stem sources become available
→ select Bass
→ start the current section loop
→ hear the isolated bass source
→ switch to Full mix
→ same section remains selected and only the full mix is audible
```

Validate the production Tauri build on macOS and Windows with rights-cleared fixtures. Browser-only mocks and Storybook do not prove audio behavior. Record source-selection state, native protocol requests, audio output observation, console health, screenshots, keyboard flow, and failure cases. Update ADR-0001 to `Accepted` only after the unchanged exact head satisfies every protected gate and the production evidence above.
