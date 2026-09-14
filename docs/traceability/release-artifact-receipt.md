# Release artifact receipt traceability

BandScope의 Distribution/update bounded context는 설치 파일을 만들었다는 사실과 상용 릴리즈로 신뢰할 수 있다는 판단을 구분합니다. 이 문서는 `scripts/release/package_desktop_artifact.py`가 생성하는 `release-receipt.json`의 현재 계약과 아직 해결되지 않은 updater/provenance 경계를 기록합니다.

## 문제

기존 패키저는 각 설치 파일에 `.sha256`과 사람이 읽는 `.manifest.txt`를 만들었지만, 태그·전체 source commit·platform/architecture·실제 패키지 bytes를 하나의 기계 판독 가능한 receipt로 묶지 않았습니다. 플랫폼 서명 또는 notarization 검증과 artifact checksum이 각각 성공해도 어떤 exact source commit의 어떤 검증된 installer bytes를 릴리즈 후보로 취급했는지 단일 증거로 연결되지 않았습니다.

이 상태에서 per-file checksum을 release provenance, updater manifest 또는 immutable release receipt와 같은 것으로 취급하면 안 됩니다.

## 제약과 소유권

- `VERSION`이 버전 권위입니다. `package.json`, Tauri config와 tag parity는 `verify_release_identity.py`가 검증합니다.
- Windows Authenticode와 macOS code signing/notarization/Gatekeeper 검증은 `verify_release_platform_trust.py`가 소유합니다.
- Commercial separation-model admission은 `verify_release_model_policy.py`와 #1180/#1181 경계에 남습니다.
- `release-receipt.json`은 Distribution package evidence입니다. Project Persistence, Resource Admission 또는 Signal/MIR가 이 포맷을 복제하거나 source-audio/model scientific identity로 사용하지 않습니다.
- 실제 updater verification key, Windows signing identity, Apple Developer ID/notarization authority는 repository에서 임의로 생성하지 않습니다.

## 선택

태그 패키징에서 native platform trust가 성공한 뒤에만 target별 `release-receipt.json`을 생성합니다. Receipt는 다음을 기록합니다.

- schema version;
- authoritative BandScope version과 일치하는 `v<version>` tag;
- 전체 40-hex Git source commit;
- platform, architecture, target triple;
- 각 packaged installer의 archive name, exact byte size, full SHA-256, checksum filename, per-artifact manifest filename.

Receipt를 만들 때 archive는 한 descriptor에서 regular-file 여부, size와 SHA-256을 다시 확인합니다. 앞서 생성한 checksum과 현재 bytes가 다르면 receipt 생성을 거부합니다. Receipt 자체는 같은 output directory에 staged write + `fsync` 후 `os.replace`로 게시합니다. PR/develop의 unsigned validation artifact에는 release receipt를 만들지 않습니다.

### 기각한 대안

1. 기존 `.sha256`만 release receipt로 간주: source commit/tag/target과 하나의 machine-readable contract로 결합되지 않으므로 기각했습니다.
2. 플랫폼 trust 검증 전에 receipt 생성: 실패한 Authenticode/notarization 후보가 release authority처럼 보일 수 있으므로 기각했습니다.
3. 짧은 commit SHA 사용: 충돌 가능성과 exact protected source 증거 부족 때문에 전체 40-hex commit을 요구합니다.
4. receipt를 updater signature 또는 SLSA provenance라고 부르기: 현재 파일은 별도 서명된 attestation이 아니므로 기각합니다.

## 실행 근거

- RED `b33958cb19ee55fdc75f2858c4f8700369ed463b`: exact tag/source/artifact binding, checksum 후 byte drift 거부, non-tag no-receipt, platform-trust-before-receipt ordering을 계약으로 추가했습니다.
- Fix `73a213c31b73524dc5e32f0d8682d868e557a4e0`: deterministic release receipt 생성과 descriptor-bound rehash를 구현했습니다.
- Repair `6d63fbf802636474c98552e855574688d414513d`: repository의 `importlib` 기반 executable-guard tests와 충돌하지 않도록 receipt value object를 import-safe `NamedTuple`로 교정했습니다.
- Edge coverage `6b0c520b56ded9b60258e64f18b6afa8db334e69`: ambiguous version, empty/mixed target, missing/malformed/link support files, linked archive와 descriptor drift를 추가 검증합니다.

Hosted exact-head workflow evidence가 terminal GREEN이 되기 전에는 위 source lineage만으로 release-ready 또는 merge-ready라고 주장하지 않습니다.

## 현재 claim boundary

`release-receipt.json`은 **검증된 tag package bytes와 exact source identity를 결합하는 local build receipt**입니다. 다음을 아직 증명하지 않습니다.

- receipt 자체의 authenticated provenance 또는 build-service non-forgeability;
- Tauri updater public-key pinning 및 `.sig` 검증;
- immutable updater manifest hosting, replay/stale-update 방지, staged rollout/deferral;
- failed/cancelled update 후 known-good rollback과 project-schema compatibility;
- SBOM/provenance/NOTICE/model artifact와 receipt의 complete release-graph 결합;
- #770의 rights-cleared real-audio scientific acceptance;
- #1181의 commercial model-rights 해결.

따라서 #960의 updater/rollback acceptance와 #1180의 complete model-release evidence는 계속 Open입니다.

## 다음 단계

다음 Distribution causal slice는 Tauri v2 updater의 실제 contract를 사용해 `createUpdaterArtifacts`, pinned public verification key, HTTPS endpoint/static manifest, generated artifact `.sig`를 하나의 source/release gate로 연결하는 것입니다. 승인된 updater signing public key가 provision되기 전에는 임의 키를 source에 넣지 않습니다. 그 다음 단계에서 updater가 wrong key/signature/digest, stale/replayed metadata, unsupported target을 거부하고 offline startup 및 rollback 경로를 보존하는지 packaged-platform evidence로 검증해야 합니다.

## 참고문헌

SLSA Community. (2026). *SLSA specification, version 1.2: Provenance*. https://slsa.dev/spec/v1.2/provenance

The Update Framework/Tauri Contributors. (2026). *Tauri v2 updater plugin*. https://v2.tauri.app/plugin/updater/

in-toto Authors. (2024). *in-toto specifications: Stable specification and Attestation Framework v1.0*. https://in-toto.io/docs/specs/
