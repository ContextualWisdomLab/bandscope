# Release artifact receipt traceability

BandScope의 Distribution/update bounded context는 설치 파일을 만들었다는 사실과 상용 릴리즈로 신뢰할 수 있다는 판단을 구분합니다. 이 문서는 `scripts/release/package_desktop_artifact.py`가 생성하는 target receipt, Tauri v2 updater artifact와 static manifest binding, 그리고 아직 해결되지 않은 publication/provenance 경계를 기록합니다.

## 문제

기존 패키저는 각 설치 파일에 `.sha256`과 사람이 읽는 `.manifest.txt`를 만들었지만, 태그·전체 source commit·platform/architecture·실제 패키지 bytes를 하나의 기계 판독 가능한 receipt로 묶지 않았습니다. 플랫폼 서명 또는 notarization 검증과 artifact checksum이 각각 성공해도 어떤 exact source commit의 어떤 검증된 installer bytes를 릴리즈 후보로 취급했는지 단일 증거로 연결되지 않았습니다.

첫 receipt 구현 뒤에도 updater 쪽에는 별도의 결함이 남았습니다. Tauri v2는 `createUpdaterArtifacts=true`일 때 Windows installer 옆에 `.sig`를 만들고, macOS에서는 `.app.tar.gz` updater bundle과 `.sig`를 생성합니다. 그런데 BandScope 패키저는 처음에는 DMG/EXE/MSI만 release artifact로 복사했습니다. 그 뒤 updater bundle/signature를 receipt에 결합했지만, Tauri client가 실제로 소비하는 `latest.json`이 receipt-authorized bytes에서 만들어진다는 보장은 없었습니다. 별도 manifest가 오래된 signature나 다른 bundle URL을 가리켜도 installer receipt만으로는 이를 검출할 수 없었습니다.

Tauri의 static updater contract는 각 target에 URL과 signature **내용**을 요구합니다. 공식 `tauri-action` 구현도 generated `.sig` 파일을 읽어 그 문자열을 `latest.json`의 `signature`에 넣습니다. 따라서 파일명이나 signature 경로를 manifest에 넣는 방식은 계약과 맞지 않습니다.

## 제약과 소유권

- `VERSION`이 버전 권위입니다. `package.json`, Tauri config와 tag parity는 `verify_release_identity.py`가 검증합니다.
- Windows Authenticode와 macOS code signing/notarization/Gatekeeper 검증은 `verify_release_platform_trust.py`가 소유합니다.
- Updater policy/config/Cargo/runtime admission은 `verify_release_updater_policy.py`가 소유합니다.
- Commercial separation-model admission은 `verify_release_model_policy.py`와 #1180/#1181 경계에 남습니다.
- Target `release-receipt.json`과 `latest.json`은 Distribution package/publication evidence입니다. Project Persistence, Resource Admission 또는 Signal/MIR가 이 포맷을 복제하거나 source-audio/model scientific identity로 사용하지 않습니다.
- 실제 updater private signing key, approved public verification key/production discovery endpoint, Windows signing identity, Apple Developer ID/notarization authority는 repository에서 임의로 생성하지 않습니다.

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

`build_updater_manifest.py`는 immutable publication 직전에 `select_release_assets.py`를 다시 실행해 extracted release graph를 re-admit합니다. 그 뒤 네 target receipt의 `VERSION`/tag/source identity를 확인하고 target마다 updater artifact가 정확히 하나일 때만 static manifest를 구성합니다. `.sig`는 regular/non-link/64 KiB bounded descriptor에서 다시 읽고 receipt의 exact size/full SHA-256과 일치하는지 확인한 뒤, **그 exact UTF-8 내용**을 `signature`에 넣습니다. URL은 mutable `releases/latest`가 아니라 `https://<release-origin>/<owner>/<repo>/releases/download/v<version>/<exact-bundle>` 형식의 exact-tag asset URL로 생성합니다.

`latest.json`은 deterministic JSON으로 staged write + file `fsync` + `os.replace` + 가능한 플랫폼에서 parent-directory `fsync`로 게시합니다. Release workflow는 manifest를 만든 뒤 `--check`로 동일 release graph에서 다시 계산한 bytes와 exact equality를 확인하고, installer/updater/receipt/SBOM/inventory와 `latest.json`을 같은 draft release asset set으로 전달한 뒤에만 immutable release를 publish합니다. 현재 공개 `v0.1.3` release가 GitHub API에서 immutable release로 보고되는 repository publication model을 그대로 사용하며, manifest URL도 같은 exact-tag release namespace를 사용합니다.

### 기각한 대안

1. 기존 `.sha256`만 release receipt로 간주: source commit/tag/target과 하나의 machine-readable contract로 결합되지 않으므로 기각했습니다.
2. `createUpdaterArtifacts=true`만으로 updater release evidence가 있다고 간주: 설정은 실제 `.sig` 또는 macOS updater bundle bytes의 존재·identity를 증명하지 못하므로 기각했습니다.
3. `.sig` 파일명만 receipt에 기록: receipt 생성 전 bytes가 바뀌어도 잡지 못하고 immutable publication evidence가 되지 않으므로 exact size/full SHA-256까지 묶습니다.
4. macOS DMG를 updater payload로 간주: Tauri v2의 macOS updater bundle은 `.app.tar.gz`이므로 기각했습니다.
5. 플랫폼 trust 검증 전에 receipt 생성: 실패한 Authenticode/notarization 후보가 release authority처럼 보일 수 있으므로 기각했습니다.
6. 짧은 commit SHA 사용: 충돌 가능성과 exact protected source 증거 부족 때문에 전체 40-hex commit을 요구합니다.
7. receipt를 updater signature 검증 또는 SLSA provenance라고 부르기: 현재 receipt는 별도 서명된 attestation이 아니고 `.sig`의 cryptographic validity를 이 함수에서 검증하지 않으므로 기각합니다.
8. `latest.json`에서 `.sig` 경로를 `signature`로 사용: Tauri static updater contract와 공식 `tauri-action` 모두 signature file **내용**을 요구하므로 기각했습니다.
9. `releases/latest` URL을 bundle authority로 사용: prerelease/channel drift와 mutable lookup을 exact release evidence에 섞게 되므로 exact version tag URL을 사용합니다.
10. manifest를 receipt와 별도 workflow에서 재구성: 동일 target graph에 대한 publication authority가 분리되고 TOCTOU 검증이 약해지므로 같은 release job에서 build→recheck→draft upload→publish를 수행합니다.

## 실행 근거

Installer/source identity slice:

- RED `b33958cb19ee55fdc75f2858c4f8700369ed463b`: exact tag/source/artifact binding, checksum 후 byte drift 거부, non-tag no-receipt, platform-trust-before-receipt ordering을 계약으로 추가했습니다.
- Fix `73a213c31b73524dc5e32f0d8682d868e557a4e0`: deterministic release receipt 생성과 descriptor-bound rehash를 구현했습니다.
- Repair `6d63fbf802636474c98552e855574688d414513d`: repository의 `importlib` 기반 executable-guard tests와 충돌하지 않도록 receipt value object를 import-safe `NamedTuple`로 교정했습니다.
- Edge coverage `6b0c520b56ded9b60258e64f18b6afa8db334e69`: ambiguous version, empty/mixed target, missing/malformed/link support files, linked archive와 descriptor drift를 추가 검증합니다.

Updater artifact slice:

- RED `421aaeec44fcb93f0250f44487d56a7b711aede0`: Windows installer에 adjacent Tauri `.sig`가 없을 때의 fail-closed, macOS `.app.tar.gz`/`.sig` 요구, copied updater evidence의 receipt binding과 post-copy drift rejection, non-tag 독립성을 계약으로 추가했습니다.
- Fix `0e012723e2bff7068d162b721a29d3141c036175`: Tauri v2 platform별 updater bundle/signature를 target release output에 수집하고 exact bytes를 `release-receipt.json`의 `updaterArtifacts`에 결합합니다. Windows standard installer와 updater bundle byte identity도 확인합니다.
- Publication re-admission `6d50e44f2252a64868c3b610185a2e9f76348696`: Actions artifact transfer 뒤에도 receipt와 installer/updater/signature bytes를 다시 검증합니다.
- Collision repair `a456b1aad8f0c5ed1a69676d13dc8dea06b78a43` + coverage `4ab309f8250ba0311d61e8af6b599d2953303c18`: 네 target receipt가 artifact aggregation 과정에서 서로 덮어쓰지 않도록 exact target-qualified names를 사용합니다.

Static updater-manifest slice:

- RED `03555ee9eb54150798363bcc7c634fe6800b13d6`: exact receipts/signature contents/tag URLs, post-generation signature drift, target ambiguity, HTTPS-only URL과 publish-before-check 방지를 executable contract로 추가했습니다.
- Fix `340b476e0039a5367d4d471da99d396c9045aa3a`: `build_updater_manifest.py`를 추가해 receipt-authorized bytes에서 deterministic Tauri static manifest를 생성하도록 했습니다.
- Publication wiring `4d6f7cb8cefd382ada8e01925425e5ea192f579b`: tag release job이 manifest를 생성하고 publication 직전 `--check`한 뒤 `latest.json`을 같은 immutable release asset set에 포함하도록 연결했습니다.
- Primary-contract repair `64fbd14df9bf92ae2618f7cc13008cc283c19545`: official `tauri-action`과 같이 `.sig`의 exact UTF-8 text를 보존하도록 수정했습니다. Receipt hash는 원본 signature bytes에 계속 결합됩니다.
- Test/format repair `889554d2c9200ec1258d1845655b2785486a6a31`: root pytest/ruff gate가 실행하는 manifest tests를 current failure boundary에 맞추고 unused import와 formatting drift를 제거했습니다.

Hosted exact-head workflow evidence가 terminal GREEN이 되기 전에는 위 source lineage만으로 release-ready 또는 merge-ready라고 주장하지 않습니다. 이 slice 이후의 head는 predecessor check/review evidence를 승계하지 않습니다.

## 현재 claim boundary

Target receipt와 generated `latest.json`은 **검증된 tag package bytes, copied updater bundle/signature bytes, exact source identity와 exact-tag download URL을 하나의 publication graph로 결합하는 local release evidence**입니다. Manifest가 receipt에 기록된 `.sig` bytes의 exact text를 싣는다는 것은 검증하지만, 그 signature가 아직 provision되지 않은 organization-approved updater public key로 cryptographically valid하다는 사실까지 증명하지 않습니다.

현재 updater policy는 의도적으로 `blocked`입니다. 승인된 public verification key와 production discovery endpoint가 provision되지 않았기 때문에 현재 source를 상용 updater authority가 준비된 상태라고 해석하지 않습니다. `latest.json` 생성 기능은 future admitted release에서 사용할 deterministic publication primitive이며, tag preflight는 blocked policy에서 계속 fail closed합니다.

다음은 아직 별도 acceptance 대상입니다.

- receipt/manifest 자체의 authenticated provenance 또는 build-service non-forgeability;
- approved Tauri updater public-key provisioning 및 generated `.sig` cryptographic verification;
- immutable publication 뒤 hosted `latest.json`과 hosted bundle/signature bytes의 post-publish re-fetch/re-admission evidence;
- wrong-key/signature/digest/truncation 및 replay/stale-update 방지;
- staged rollout, explicit deferral, bounded retry, offline startup;
- failed/cancelled update 후 known-good rollback과 project-schema compatibility;
- SBOM/provenance/NOTICE/model artifact와 receipt의 complete release-graph 결합;
- #770의 rights-cleared real-audio scientific acceptance;
- #1181의 commercial model-rights 해결.

따라서 #960의 updater/rollback acceptance와 #1180의 complete model-release evidence는 계속 Open입니다.

## 다음 단계

다음 Distribution causal slice는 **published release re-verification과 updater anti-replay/rollback contract**입니다. Draft asset set이 immutable publication으로 승격된 뒤 hosted `latest.json`, target updater bundle과 signature를 다시 읽어 local receipt/digest와 같은지 검증하는 evidence가 필요합니다. 그 다음 version monotonicity/stale metadata 거부, wrong key/signature/digest, truncated download, unsupported target, partial download/disk-full/cancel, offline startup, first-launch failure와 known-good rollback을 packaged-platform acceptance로 연결해야 합니다.

승인된 updater public key/production discovery endpoint, Windows/macOS signer authority와 commercial model rights는 외부 권위입니다. 이 값들은 source repair 과정에서 임의 생성하지 않습니다.

## 참고문헌

SLSA Community. (2026). *SLSA specification, version 1.2: Provenance*. https://slsa.dev/spec/v1.2/provenance

Tauri Contributors. (2026). *Tauri v2 updater plugin*. https://v2.tauri.app/plugin/updater/

Tauri Contributors. (2026). *Tauri Action: upload-version-json.ts* (Commit a6e90ddc4ba4721f294e52b856d3d50e645edc07). https://github.com/tauri-apps/tauri-action/blob/a6e90ddc4ba4721f294e52b856d3d50e645edc07/src/upload-version-json.ts

in-toto Authors. (2024). *in-toto specifications: Stable specification and Attestation Framework v1.0*. https://in-toto.io/docs/specs/
