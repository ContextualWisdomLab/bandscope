# Release artifact receipt traceability

BandScope의 Distribution/update bounded context는 설치 파일을 만들었다는 사실과 상용 릴리즈로 신뢰할 수 있다는 판단을 구분합니다. 이 문서는 `scripts/release/package_desktop_artifact.py`가 생성하는 `release-receipt.json`의 현재 계약, Tauri v2 updater artifact binding, 그리고 아직 해결되지 않은 publication/provenance 경계를 기록합니다.

## 문제

기존 패키저는 각 설치 파일에 `.sha256`과 사람이 읽는 `.manifest.txt`를 만들었지만, 태그·전체 source commit·platform/architecture·실제 패키지 bytes를 하나의 기계 판독 가능한 receipt로 묶지 않았습니다. 플랫폼 서명 또는 notarization 검증과 artifact checksum이 각각 성공해도 어떤 exact source commit의 어떤 검증된 installer bytes를 릴리즈 후보로 취급했는지 단일 증거로 연결되지 않았습니다.

첫 receipt 구현 뒤에도 updater 쪽에는 별도의 결함이 남았습니다. Tauri v2는 `createUpdaterArtifacts=true`일 때 Windows installer 옆에 `.sig`를 만들고, macOS에서는 `.app.tar.gz` updater bundle과 `.sig`를 생성합니다. 그런데 BandScope 패키저는 DMG/EXE/MSI만 release artifact로 복사했습니다. 따라서 updater admission이 source/config 수준에서 맞더라도 실제 Tauri updater bundle/signature bytes가 immutable release candidate와 같은 receipt에 묶이지 않을 수 있었습니다. 설치 파일 checksum만으로 updater payload/signature publication을 대신했다고 볼 수 없습니다. Tauri는 updater signature 검증을 비활성화할 수 없고 static manifest의 `signature`에는 생성된 `.sig`의 내용 자체가 들어가야 합니다.

## 제약과 소유권

- `VERSION`이 버전 권위입니다. `package.json`, Tauri config와 tag parity는 `verify_release_identity.py`가 검증합니다.
- Windows Authenticode와 macOS code signing/notarization/Gatekeeper 검증은 `verify_release_platform_trust.py`가 소유합니다.
- Updater policy/config/Cargo/runtime admission은 `verify_release_updater_policy.py`가 소유합니다.
- Commercial separation-model admission은 `verify_release_model_policy.py`와 #1180/#1181 경계에 남습니다.
- `release-receipt.json`은 Distribution package evidence입니다. Project Persistence, Resource Admission 또는 Signal/MIR가 이 포맷을 복제하거나 source-audio/model scientific identity로 사용하지 않습니다.
- 실제 updater private signing key, approved public verification key/production endpoint, Windows signing identity, Apple Developer ID/notarization authority는 repository에서 임의로 생성하지 않습니다.

## 선택

태그 패키징은 release-admission preflight를 먼저 통과해야 합니다. 표준 installer와 updater companion을 수집한 뒤 native platform trust가 성공해야 target별 `release-receipt.json`을 생성합니다.

Receipt는 다음을 기록합니다.

- schema version;
- authoritative BandScope version과 일치하는 `v<version>` tag;
- 전체 40-hex Git source commit;
- platform, architecture, target triple;
- 각 packaged installer의 archive name, exact byte size, full SHA-256, checksum filename, per-artifact manifest filename;
- 존재하는 Tauri updater bundle의 exact byte size/full SHA-256;
- updater `.sig` filename, exact byte size/full SHA-256.

Windows에서는 Tauri v2의 표준 NSIS/MSI installer가 updater bundle 자체이므로, source installer와 BandScope가 이름을 바꿔 복사한 installer bytes가 정확히 같은지 확인하고 adjacent `<installer>.sig`를 release output에 함께 복사합니다. Signature는 regular/non-link/non-empty여야 하고 64 KiB ceiling을 넘을 수 없습니다.

macOS에서는 exact target의 `target/<triple>/release/bundle/macos/` 아래에 updater용 `*.app.tar.gz`가 정확히 하나 있어야 하며, adjacent `.sig`가 있어야 합니다. Bundle은 target-specific BandScope release filename으로 복사하고 signature도 함께 복사합니다. 여러 bundle, missing bundle/signature, symlink/non-regular/empty evidence는 fail closed입니다.

Updater source와 copied output은 각각 안정된 regular-file descriptor에서 size/full SHA-256을 확인합니다. Receipt 직전에도 copied bundle/signature를 다시 열어 패키징 시 기록한 identity와 일치하는지 확인합니다. 복사 후 byte drift가 있으면 receipt를 만들지 않습니다.

표준 installer도 receipt 직전에 한 descriptor에서 regular-file 여부, size와 SHA-256을 다시 확인하며 앞서 생성한 checksum과 현재 bytes가 다르면 거부합니다. Receipt 자체는 같은 output directory에 staged write + `fsync` 후 `os.replace`로 게시합니다. PR/develop의 unsigned validation build에는 release receipt나 updater artifact admission을 요구하지 않습니다.

### 기각한 대안

1. 기존 `.sha256`만 release receipt로 간주: source commit/tag/target과 하나의 machine-readable contract로 결합되지 않으므로 기각했습니다.
2. `createUpdaterArtifacts=true`만으로 updater release evidence가 있다고 간주: 설정은 실제 `.sig` 또는 macOS updater bundle bytes의 존재·identity를 증명하지 못하므로 기각했습니다.
3. `.sig` 파일명만 receipt에 기록: receipt 생성 전 bytes가 바뀌어도 잡지 못하고 immutable publication evidence가 되지 않으므로 exact size/full SHA-256까지 묶습니다.
4. macOS DMG를 updater payload로 간주: Tauri v2의 macOS updater bundle은 `.app.tar.gz`이므로 기각했습니다.
5. 플랫폼 trust 검증 전에 receipt 생성: 실패한 Authenticode/notarization 후보가 release authority처럼 보일 수 있으므로 기각했습니다.
6. 짧은 commit SHA 사용: 충돌 가능성과 exact protected source 증거 부족 때문에 전체 40-hex commit을 요구합니다.
7. receipt를 updater signature 검증 또는 SLSA provenance라고 부르기: 현재 receipt는 별도 서명된 attestation이 아니고 `.sig`의 cryptographic validity를 이 함수에서 검증하지 않으므로 기각합니다.

## 실행 근거

Installer/source identity slice:

- RED `b33958cb19ee55fdc75f2858c4f8700369ed463b`: exact tag/source/artifact binding, checksum 후 byte drift 거부, non-tag no-receipt, platform-trust-before-receipt ordering을 계약으로 추가했습니다.
- Fix `73a213c31b73524dc5e32f0d8682d868e557a4e0`: deterministic release receipt 생성과 descriptor-bound rehash를 구현했습니다.
- Repair `6d63fbf802636474c98552e855574688d414513d`: repository의 `importlib` 기반 executable-guard tests와 충돌하지 않도록 receipt value object를 import-safe `NamedTuple`로 교정했습니다.
- Edge coverage `6b0c520b56ded9b60258e64f18b6afa8db334e69`: ambiguous version, empty/mixed target, missing/malformed/link support files, linked archive와 descriptor drift를 추가 검증합니다.

Updater artifact slice:

- RED `421aaeec44fcb93f0250f44487d56a7b711aede0`: Windows installer에 adjacent Tauri `.sig`가 없을 때의 fail-closed, macOS `.app.tar.gz`/`.sig` 요구, copied updater evidence의 receipt binding과 post-copy drift rejection, non-tag 독립성을 계약으로 추가했습니다.
- Fix `0e012723e2bff7068d162b721a29d3141c036175`: Tauri v2 platform별 updater bundle/signature를 target release output에 수집하고 exact bytes를 `release-receipt.json`의 `updaterArtifacts`에 결합합니다. Windows standard installer와 updater bundle byte identity도 확인합니다.

Hosted exact-head workflow evidence가 terminal GREEN이 되기 전에는 위 source lineage만으로 release-ready 또는 merge-ready라고 주장하지 않습니다. 이 slice 이후의 head는 predecessor check/review evidence를 승계하지 않습니다.

## 현재 claim boundary

`release-receipt.json`은 **검증된 tag package bytes, copied updater bundle/signature bytes와 exact source identity를 결합하는 local build receipt**입니다. Updater signature의 존재와 exact bytes를 보존하지만 그 signature가 approved updater key로 cryptographically valid하다는 사실을 이 receipt writer 자체가 증명하지는 않습니다.

다음은 아직 별도 acceptance 대상입니다.

- receipt 자체의 authenticated provenance 또는 build-service non-forgeability;
- approved Tauri updater public-key provisioning 및 generated `.sig` cryptographic verification;
- static/dynamic updater manifest가 exact release receipt와 bundle/signature bytes를 참조한다는 publication evidence;
- immutable updater manifest hosting, wrong-key/signature/digest/truncation 및 replay/stale-update 방지;
- staged rollout, explicit deferral, bounded retry, offline startup;
- failed/cancelled update 후 known-good rollback과 project-schema compatibility;
- SBOM/provenance/NOTICE/model artifact와 receipt의 complete release-graph 결합;
- #770의 rights-cleared real-audio scientific acceptance;
- #1181의 commercial model-rights 해결.

따라서 #960의 updater/rollback acceptance와 #1180의 complete model-release evidence는 계속 Open입니다.

## 다음 단계

다음 Distribution causal slice는 static/dynamic updater manifest를 exact `updaterArtifacts` receipt에 연결하는 것입니다. Manifest의 version/target/url/signature 내용이 이 release candidate의 exact bundle과 `.sig` bytes에서 파생되고 immutable publication까지 이어져야 합니다. 승인된 updater public key/production endpoint가 provision되기 전에는 임의 값을 source에 넣지 않습니다.

그 뒤 packaged-platform acceptance에서 wrong key/signature/digest, truncated 또는 stale/replayed metadata, unsupported target, partial download/disk-full/cancel, offline startup, first-launch failure와 known-good rollback을 검증해야 합니다.

## 참고문헌

SLSA Community. (2026). *SLSA specification, version 1.2: Provenance*. https://slsa.dev/spec/v1.2/provenance

Tauri Contributors. (2026). *Tauri v2 updater plugin*. https://v2.tauri.app/plugin/updater/

in-toto Authors. (2024). *in-toto specifications: Stable specification and Attestation Framework v1.0*. https://in-toto.io/docs/specs/
