# Release artifact receipt traceability

BandScope의 Distribution/update bounded context는 설치 파일을 만들었다는 사실과 상용 릴리즈로 신뢰할 수 있다는 판단을 구분합니다. 이 문서는 `scripts/release/package_desktop_artifact.py`가 생성하는 target receipt, Tauri v2 updater artifact와 static manifest binding, hosted release byte/attestation re-verification, 그리고 아직 해결되지 않은 signing/rollback 경계를 기록합니다.

## 문제

기존 패키저는 각 설치 파일에 `.sha256`과 사람이 읽는 `.manifest.txt`를 만들었지만, 태그·전체 source commit·platform/architecture·실제 패키지 bytes를 하나의 기계 판독 가능한 receipt로 묶지 않았습니다. 플랫폼 서명 또는 notarization 검증과 artifact checksum이 각각 성공해도 어떤 exact source commit의 어떤 검증된 installer bytes를 릴리즈 후보로 취급했는지 단일 증거로 연결되지 않았습니다.

첫 receipt 구현 뒤에도 updater 쪽에는 별도의 결함이 남았습니다. Tauri v2는 `createUpdaterArtifacts=true`일 때 Windows installer 옆에 `.sig`를 만들고, macOS에서는 `.app.tar.gz` updater bundle과 `.sig`를 생성합니다. 그런데 BandScope 패키저는 처음에는 DMG/EXE/MSI만 release artifact로 복사했습니다. 그 뒤 updater bundle/signature를 receipt에 결합했지만, Tauri client가 실제로 소비하는 `latest.json`이 receipt-authorized bytes에서 만들어진다는 보장은 없었습니다. 별도 manifest가 오래된 signature나 다른 bundle URL을 가리켜도 installer receipt만으로는 이를 검출할 수 없었습니다.

Tauri의 static updater contract는 각 target에 URL과 signature **내용**을 요구합니다. 공식 `tauri-action` 구현도 generated `.sig` 파일을 읽어 그 문자열을 `latest.json`의 `signature`에 넣습니다. 따라서 파일명이나 signature 경로를 manifest에 넣는 방식은 계약과 맞지 않습니다.

Manifest를 같은 draft release asset set에 포함시킨 뒤에도 publication boundary가 남았습니다. 로컬에서 검증한 asset을 `gh release create`에 넘겼다는 사실만으로 GitHub에 실제 저장된 draft/published asset bytes가 동일하다고 증명할 수 없습니다. 업로드 누락·잘못된 asset set·전송 후 byte drift를 local receipt에서 곧바로 관찰할 수 없기 때문입니다. GitHub immutable releases는 draft에 모든 asset을 붙인 뒤 publish하는 방식을 권고하고, publication 후 release/tag/assets를 잠그며 release attestation을 생성합니다. 따라서 BandScope의 local release graph, hosted asset graph, GitHub의 signed immutable-release attestation을 publication 경계에서 결합해야 합니다.

## 제약과 소유권

- `VERSION`이 버전 권위입니다. `package.json`, Tauri config와 tag parity는 `verify_release_identity.py`가 검증합니다.
- Windows Authenticode와 macOS code signing/notarization/Gatekeeper 검증은 `verify_release_platform_trust.py`가 소유합니다.
- Updater policy/config/Cargo/runtime admission은 `verify_release_updater_policy.py`가 소유합니다.
- Commercial separation-model admission은 `verify_release_model_policy.py`와 #1180/#1181 경계에 남습니다.
- Target `release-receipt.json`, `latest.json`, hosted byte/attestation re-verification은 Distribution package/publication evidence입니다. Project Persistence, Resource Admission 또는 Signal/MIR가 이 포맷을 복제하거나 source-audio/model scientific identity로 사용하지 않습니다.
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

`latest.json`은 deterministic JSON으로 staged write + file `fsync` + `os.replace` + 가능한 플랫폼에서 parent-directory `fsync`로 게시합니다. Release workflow는 manifest를 만든 뒤 `--check`로 동일 release graph에서 다시 계산한 bytes와 exact equality를 확인하고 installer/updater/receipt/SBOM/inventory와 `latest.json`을 같은 draft release asset set으로 전달합니다.

`verify_hosted_release_assets.py`는 publication transfer를 별도 신뢰 경계로 취급합니다. `release-assets.txt`는 256 KiB/256-member 한도로 제한하고, repository-relative safe path와 unique hosted basename만 허용합니다. Draft release를 만든 뒤 `gh release download <exact-tag>`로 asset을 별도 directory에 다시 내려받고, 예상한 basename set과 downloaded set이 정확히 같은지 확인합니다. 각 local/hosted file은 regular/non-link file이어야 하고 stable descriptor에서 exact byte size와 streaming SHA-256이 같아야 합니다. 누락 asset, extra asset, duplicate publication basename, signature/manifest/installer byte drift는 publish 전에 fail closed합니다.

Draft hosted bytes가 local admitted bytes와 일치한 뒤에만 release를 publish합니다. Publication 후에는 fresh directory로 같은 exact tag assets를 다시 다운로드하고 동일 verifier를 다시 실행합니다. 따라서 local `release-assets.txt` → draft hosted asset set → published hosted asset set의 byte identity를 하나의 workflow 안에서 확인합니다.

Published hosted byte parity가 성공한 뒤에는 GitHub의 immutable-release attestation을 별도 권위로 검증합니다. `gh release verify <exact-tag>`가 release attestation을 cryptographically 검증해야 하고, `release-assets.txt`의 모든 local asset은 각각 `gh release verify-asset <exact-tag> <local-path>`를 통과해야 합니다. GitHub 문서상 immutable release attestation은 release tag, commit SHA, release assets를 포함하며 `verify-asset`은 local digest가 해당 release attestation subject와 일치하는지 확인합니다. 이 단계는 BandScope 자체 SHA-256 parity를 없애는 것이 아니라 독립적인 GitHub-hosted signed evidence를 추가합니다.

### 기각한 대안

1. 기존 `.sha256`만 release receipt로 간주: source commit/tag/target과 하나의 machine-readable contract로 결합되지 않으므로 기각했습니다.
2. `createUpdaterArtifacts=true`만으로 updater release evidence가 있다고 간주: 설정은 실제 `.sig` 또는 macOS updater bundle bytes의 존재·identity를 증명하지 못하므로 기각했습니다.
3. `.sig` 파일명만 receipt에 기록: receipt 생성 전 bytes가 바뀌어도 잡지 못하고 immutable publication evidence가 되지 않으므로 exact size/full SHA-256까지 묶습니다.
4. macOS DMG를 updater payload로 간주: Tauri v2의 macOS updater bundle은 `.app.tar.gz`이므로 기각했습니다.
5. 플랫폼 trust 검증 전에 receipt 생성: 실패한 Authenticode/notarization 후보가 release authority처럼 보일 수 있으므로 기각했습니다.
6. 짧은 commit SHA 사용: 충돌 가능성과 exact protected source 증거 부족 때문에 전체 40-hex commit을 요구합니다.
7. receipt를 updater signature 검증 또는 SLSA provenance라고 부르기: receipt는 별도 서명된 attestation이 아니고 `.sig`의 cryptographic validity를 이 함수에서 검증하지 않으므로 기각합니다.
8. `latest.json`에서 `.sig` 경로를 `signature`로 사용: Tauri static updater contract와 공식 `tauri-action` 모두 signature file **내용**을 요구하므로 기각했습니다.
9. `releases/latest` URL을 bundle authority로 사용: prerelease/channel drift와 mutable lookup을 exact release evidence에 섞게 되므로 exact version tag URL을 사용합니다.
10. manifest를 receipt와 별도 workflow에서 재구성: 동일 target graph에 대한 publication authority가 분리되고 TOCTOU 검증이 약해지므로 같은 release job에서 build→recheck→draft upload를 수행합니다.
11. `gh release create` 성공을 hosted byte identity 증거로 간주: API 성공은 local expected set과 remote stored set의 exact parity를 보장하는 BandScope evidence가 아니므로 draft와 published 상태에서 모두 다시 다운로드해 비교합니다.
12. published release만 사후 확인: immutable publish 뒤 mismatch를 발견하면 정상 release를 수리할 수 없으므로 draft download/re-verification을 publication 전 gate로 먼저 둡니다.
13. 자체 SHA-256 parity만으로 immutable release provenance를 주장: local/remote byte equality는 누가 release를 attest했는지 증명하지 않으므로 GitHub의 signed release attestation과 per-asset attestation verification을 추가합니다.

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
- Traceability `f0d6dd57451984820afb07c41cae172f3c7f3628`: static manifest 결정, primary reference와 claim boundary를 기록했습니다.

Hosted publication re-verification slice:

- RED `db4ad0660bc0b262bdf921c243c9691bee29118c`: draft/final hosted asset set과 local admitted bytes의 parity, signature drift, missing/extra asset, duplicate/nested publication authority, workflow ordering을 executable contract로 추가했습니다.
- Fix `e0227942e31100d4a9a0dc3e8c8f7fa95a8613fb`: `verify_hosted_release_assets.py`를 추가해 bounded safe asset list와 flat hosted asset set을 비교하고 stable regular-file descriptor에서 size/full SHA-256 parity를 검증합니다.
- Publication wiring `3c9221b4ea517aea296739302e025b0c9196d198`: draft release upload 뒤 fresh download/re-verification이 성공해야 publish하고, publish 뒤 다시 fresh download/re-verification하도록 workflow를 연결했습니다. 이 commit은 이전 workflow EOF newline drift도 함께 바로잡았습니다.
- Test format `3412a19eb9c2f90ce10fde2d374e3a8a74b91b8e`: repository formatter 규칙에 맞춰 hosted re-verification coverage를 정리했습니다.
- Attestation RED `0f13ef0e11612e8bd3e25ae5783d372b812b6c6d`: published release가 GitHub signed release attestation과 per-asset attestation verification까지 통과해야 한다는 workflow contract를 추가했습니다.
- Attestation fix `b65f00cd607df30f9807894368667b92e2911e38`: post-publish hosted byte parity 뒤 `gh release verify`와 모든 local release asset의 `gh release verify-asset`을 fail-closed gate로 연결했습니다.

Hosted exact-head workflow evidence가 terminal GREEN이 되기 전에는 위 source lineage만으로 release-ready 또는 merge-ready라고 주장하지 않습니다. 이 slice 이후의 head는 predecessor check/review evidence를 승계하지 않습니다.

## 현재 claim boundary

Target receipt, generated `latest.json`, draft/final hosted byte parity와 GitHub immutable-release attestation은 **검증된 tag package bytes, copied updater bundle/signature bytes, exact source identity, exact-tag download URL, GitHub release asset namespace와 GitHub signed release evidence를 하나의 Distribution publication graph로 결합**합니다. Manifest가 receipt에 기록된 `.sig` bytes의 exact text를 싣고 uploaded/downloaded bytes가 일치하며 GitHub attestation subject와 local assets가 맞는다는 것은 검증하지만, Tauri updater `.sig`가 아직 provision되지 않은 organization-approved updater public key로 cryptographically valid하다는 사실까지 증명하지 않습니다.

현재 updater policy는 의도적으로 `blocked`입니다. 승인된 public verification key와 production discovery endpoint가 provision되지 않았기 때문에 현재 source를 상용 updater authority가 준비된 상태라고 해석하지 않습니다. `latest.json`, hosted re-verification과 immutable-release attestation gates는 future admitted release에서 사용할 publication primitives이며, tag preflight는 blocked policy에서 계속 fail closed합니다.

다음은 아직 별도 acceptance 대상입니다.

- approved Tauri updater public-key provisioning 및 generated `.sig` cryptographic verification;
- wrong-key/signature/digest/truncation 및 replay/stale-update 방지;
- staged rollout, explicit deferral, bounded retry, offline startup;
- failed/cancelled update 후 known-good rollback과 project-schema compatibility;
- SBOM/provenance/NOTICE/model artifact와 release attestation의 complete release-graph 결합;
- #770의 rights-cleared real-audio scientific acceptance;
- #1181의 commercial model-rights 해결.

따라서 #960의 updater/rollback acceptance와 #1180의 complete model-release evidence는 계속 Open입니다.

## 다음 단계

다음 Distribution causal slice는 **updater anti-replay + rollback contract**입니다. 현재 external prerequisite인 approved Tauri updater public key/production discovery endpoint가 들어오기 전에도 source-owned 상태기계와 persistence 경계는 설계·검증할 수 있습니다. Version monotonicity와 stale/replayed metadata 거부, unsupported target, truncated/partial download, disk-full/cancel, offline startup, first-launch failure, last-known-good installer retention, project-schema compatibility를 하나의 packaged update lifecycle로 연결해야 합니다. 실제 signature-positive acceptance는 승인된 key authority가 provision된 뒤 수행합니다.

승인된 updater public key/production discovery endpoint, Windows/macOS signer authority와 commercial model rights는 외부 권위입니다. 이 값들은 source repair 과정에서 임의 생성하지 않습니다.

## 참고문헌

GitHub. (2026). *Immutable releases*. https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases

GitHub. (2026). *Verifying the integrity of a release*. https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity

GitHub CLI. (2026). *gh release download*. https://cli.github.com/manual/gh_release_download

GitHub CLI. (2026). *gh release verify*. https://cli.github.com/manual/gh_release_verify

GitHub CLI. (2026). *gh release verify-asset*. https://cli.github.com/manual/gh_release_verify-asset

SLSA Community. (2026). *SLSA specification, version 1.2: Provenance*. https://slsa.dev/spec/v1.2/provenance

Tauri Contributors. (2026). *Tauri v2 updater plugin*. https://v2.tauri.app/plugin/updater/

Tauri Contributors. (2026). *Tauri Action: upload-version-json.ts* (Commit a6e90ddc4ba4721f294e52b856d3d50e645edc07). https://github.com/tauri-apps/tauri-action/blob/a6e90ddc4ba4721f294e52b856d3d50e645edc07/src/upload-version-json.ts

in-toto Authors. (2024). *in-toto specifications: Stable specification and Attestation Framework v1.0*. https://in-toto.io/docs/specs/
