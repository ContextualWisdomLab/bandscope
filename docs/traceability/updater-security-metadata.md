# Updater security metadata traceability

BandScope의 Distribution/update bounded context는 updater artifact 서명, remote metadata, local freshness state를 같은 신뢰 수준으로 취급하지 않습니다. `latest.json`은 Tauri가 요구하는 `version`, target별 `url`·`signature`와 BandScope의 release receipt에서 파생한 `bandscope` 확장 필드를 함께 싣지만, JSON 응답 자체가 updater artifact 서명으로 인증되는 것은 아닙니다.

## 확인된 trust-boundary 오류와 수정

기존 문서는 Tauri `Update.raw_json`을 향후 "authenticated metadata"처럼 연결할 수 있다고 적었습니다. current Tauri v2 계약과 구현을 다시 확인하면 이 표현은 부정확합니다.

- Tauri static updater JSON은 `version`, target별 `url`·`signature`를 제공합니다. `Update.raw_json`은 서버 JSON 응답을 그대로 보존하는 API입니다.
- Tauri의 `Update::download`는 updater bytes를 내려받은 뒤 `verify_signature(&buffer, &self.signature, &pubkey)`를 호출합니다. 즉 승인된 public key는 **다운로드한 updater artifact bytes**를 인증합니다. `raw_json`의 BandScope 확장 필드 전체를 별도로 서명·인증한다는 계약은 없습니다.
- 따라서 `sourceCommit`, `minimumSupportedVersion`, target별 SHA-256 같은 `bandscope` 필드를 syntax 검증했다는 이유만으로 highest-seen authority에 기록하면 안 됩니다. Endpoint 또는 metadata publication 경로가 변조된 경우 signed artifact와 독립적으로 version/source/digest 문맥을 오염시킬 수 있습니다.

이 finding 때문에 runtime은 state writer를 `raw_json`에 곧바로 연결하지 않습니다. `apps/desktop/distribution-runtime`은 remote JSON을 **provisional metadata**로만 admit하며, state를 쓰거나 anti-replay core에 authenticated candidate를 반환하지 않습니다.

Runtime-admission lineage:

- RED `e525aa1fb4bb7d51cd33d2f1f410e339b1f71725`: repository CI가 별도 `distribution-runtime` locked Rust suite를 요구하도록 확장했습니다.
- Foundation `5c95912ffedbd69b1bb33773520b73cc68f9dc3c` / `b9f72beb826d5a0dc01b2d82cffbc814c2f91e2a`: runtime crate와 lock graph를 만들었습니다.
- Causal boundary `85db601ff0771ef59e0601d2c1c2296f827bc5d3`: 최대 256 KiB remote JSON, duplicate/unknown member 거부, 네 release target exact set, bounded signature/URL, exact-tag HTTPS URL, updater artifact size ceiling, exact source/digest/version syntax을 Rust로 검증하되 결과 타입을 `ProvisionalUpdateMetadata`로 제한했습니다. app-local-data의 highest-seen 위치도 fixed path로 projection할 뿐 directory/file을 만들지 않습니다.
- `def74eff06c1d80521fb43336d461e206937c438` / `418c68d06c7ec2ba4bb2bc6f199ea11482c2f501`: provisional runtime crate에서 durable-state dependency를 제거해 remote metadata parsing과 trust-state mutation 사이의 우발적 결합을 없앴습니다.
- `59bc8c8c772a75d95d806dc5161b4b9935bcc2f8` / `daad6e54e4b3f4735cf10cbe421dd018a70e145c`: exact-tag 문자열 포함 여부만 보던 URL admission을 BandScope의 현재 GitHub release namespace로 고정했습니다. `github.com/ContextualWisdomLab/bandscope/releases/download/v<version>/<asset>` 이외의 host/repository/path, query, fragment, userinfo 형태, backslash, percent-encoded 또는 path-like asset name은 provisional 단계에서 거부합니다. 첫 commit의 Rust generic-pattern 표현은 hosted compiler에 의존하지 않도록 두 번째 commit에서 명시적인 char checks와 exact tag 비교로 정리했습니다.
- RED `9f7bddd3c5660739f4c4e1a060b6e6a3cd807824`: strict parser가 target별 URL·signature를 검증하고도 버리기 때문에 production transport가 같은 remote JSON을 다시 해석해야 하는 경계를 재현했습니다. `ProvisionalUpdateMetadata`가 선택 target의 exact admitted URL과 signature를 제공해야 한다는 integration contract를 먼저 추가했습니다.
- Causal fix `663affcbc940269928a4eb95eb329d99b6de57c4`: 선택 target의 URL·signature를 **같은 bounded strict parse 결과**에 보존하고 `artifact_url()` / `artifact_signature()`로만 노출했습니다. 이 값들은 여전히 provisional이며 metadata authenticity나 signature 성공을 뜻하지 않습니다. 목적은 production transport가 별도·느슨한 JSON reparse를 만들어 semantics를 갈라놓는 것을 막는 것입니다.

## Artifact URL admission

`platforms[target].url`은 metadata authenticity와 별개의 network/resource-admission 입력입니다. Artifact signature가 최종 실행 무결성을 보호하더라도, 서명 검증은 download 뒤에 일어나므로 remote JSON이 임의 host나 URL parser ambiguity를 선택하도록 두면 signature failure 이전에 원하지 않는 network destination과 response body를 소비할 수 있습니다.

현재 publisher인 `build_updater_manifest.py`는 GitHub Actions의 exact repository slug와 exact release tag를 사용해 `https://github.com/ContextualWisdomLab/bandscope/releases/download/v<version>/<asset>` 형태를 생성합니다. Runtime provisional admission도 같은 product-owned namespace만 허용합니다. URL 문자열 안에 `/releases/download/v.../`가 단순히 포함됐다는 이유만으로 허용하지 않으며, query/fragment에 해당 문자열을 숨기거나 `github.com@evil.example` 같은 userinfo 형태를 사용하는 입력도 거부합니다.

선택 target의 admitted URL과 signature는 이제 `ProvisionalUpdateMetadata`에 같이 묶입니다. Transport adapter는 raw JSON을 다시 parse하지 않고 이 값만 소비해야 합니다. 다만 이 결합은 parser-consistency 경계이지 authenticity 경계가 아닙니다. 아직 인증되지 않은 remote metadata의 URL·signature라는 점은 변하지 않습니다.

이 pin은 remote metadata를 인증하지 않습니다. 또한 GitHub 자체 compromise, organization/repository write compromise, malicious but correctly namespaced asset, oversized body를 해결하지 않습니다. 역할은 "untrusted metadata가 download destination 자체를 임의 host/path로 확장하지 못하게 한다"는 좁은 resource/network boundary입니다. 향후 Distribution이 publication backend를 바꾸려면 runtime의 canonical release-origin contract도 같은 owner에서 versioned migration으로 변경해야 합니다.

## Manifest evidence

`build_updater_manifest.py`는 release graph를 `select_release_assets.py`로 다시 admit한 뒤 target receipt에서 다음 값을 `bandscope` 객체에 기록합니다.

- `schemaVersion: 1`
- exact 40-hex `sourceCommit`
- `release/updater-policy.json`의 `minimumSupportedVersion`
- Windows amd64/arm64, macOS amd64/arm64 각각의 updater bundle `sizeBytes`와 full SHA-256

정책 파일은 fixed repository-relative path의 bounded regular non-link file로 읽고 duplicate JSON member와 descriptor drift를 거부합니다. Receipt의 source commit, version/tag, updater artifact identity가 release graph와 다르면 publication을 중단합니다. 이 값들은 **publication integrity evidence**이며 remote client가 받았을 때 자동으로 authenticated metadata가 되는 것은 아닙니다.

## Rust decision core와 durable state

`apps/desktop/distribution-core`는 filesystem/network/Tauri/installer I/O가 없는 deterministic policy owner입니다. 이미 인증된 release identity만 받는다는 전제에서 canonical stable version, exact source/digest identity, target, compatibility floor, replay, rollback, same-version equivocation, project-schema-aware known-good rollback을 결정합니다.

`apps/desktop/distribution-state`는 Distribution-owned highest-seen identity만 저장합니다. bounded append-only log를 사용하고 regular non-link state file, monotonic record, exact identity, torn-final-record prefix만 admit합니다. 새 record는 append 후 `sync_all()`과 resulting length 확인이 끝나야 성공입니다. 이 state는 Project Persistence가 소유하는 project bytes/schema와 분리됩니다.

중요한 순서는 다음과 같습니다.

1. Remote updater JSON은 untrusted/provisional input으로 bounded parsing하고 현재 product release namespace 밖 URL을 거부합니다.
2. Metadata의 version/source/digest 문맥을 조직이 승인한 방식으로 인증합니다. 현재 이 authority는 아직 구현·provision되지 않았습니다.
3. Updater artifact bytes는 Tauri updater public key로 signature verification을 통과해야 합니다.
4. Authenticated metadata가 주장한 artifact digest/size와 실제 verified artifact가 일치해야 합니다.
5. 그 뒤에만 `distribution-core`와 `distribution-state`를 통해 highest-seen freshness authority를 갱신할 수 있습니다.

현재 2번이 없으므로 5번을 runtime에 연결하지 않는 것이 fail-closed 동작입니다. 설치를 미룬 release까지 pre-install highest-seen으로 기억하려면 metadata 자체의 authenticity가 필요합니다. 그것 없이 remote version만 먼저 저장하는 것은 freeze/replay 방어가 아니라 local state poisoning 경로가 될 수 있습니다.

## Resource-admission 상태

Tauri current source의 `Update::download`는 HTTP body chunk를 `Vec`에 누적한 다음 signature를 검증합니다. BandScope manifest는 declared artifact size를 bounded field로 갖지만 remote server가 그 값을 지킨다는 보장은 없습니다. 그래서 `apps/desktop/distribution-download`에 별도 Rust boundary를 두었습니다. 현재 이 boundary는 `(0, 2 GiB]` expected size, optional `Content-Length` exact match, 1 MiB caller chunk ceiling, cumulative overrun 차단, exclusive `create_new` staging, error/cancel cleanup, exact-size seal, descriptor-bound read-only verifier와 seal-time byte ceiling을 구현합니다. Sealed-but-unverified bytes는 drop 시 정리되며 trust promotion이 아닙니다.

남은 gap은 **production HTTP adapter가 아직 이 boundary를 실제 response path로 사용하지 않는다는 점**입니다. URL namespace pinning과 `distribution-download`가 각각 존재한다는 사실만으로 end-to-end bounded download를 주장할 수 없습니다. Production adapter는 strict parse에서 보존한 `artifact_url()`을 소비하고 redirect/effective-origin을 명시적으로 검증하며 response chunks를 `distribution-download`로 전달해야 합니다. 그 뒤에도 metadata authenticity, artifact signature, exact digest/size binding과 verified-artifact promotion이 별도로 필요합니다.

## 보안 경계와 기각한 대안

`bandscope` JSON 필드 자체, HTTPS endpoint만의 존재, GitHub immutable-release attestation, updater artifact `.sig` 가운데 어느 하나도 remote metadata 전체의 독립적인 freshness authority를 대신하지 않습니다. GitHub attestation은 published release asset 집합의 publication evidence이고, Tauri `.sig`는 updater artifact bytes의 authenticity/integrity evidence입니다.

`raw_json`을 "Tauri가 받았으므로 authenticated"라고 간주하는 방식은 기각합니다. artifact signature가 통과하기 전 remote JSON을 highest-seen state에 쓰는 방식도 기각합니다. URL 안에 exact-tag path 조각이 포함되기만 하면 임의 host를 허용하는 방식도 기각합니다. Strict parser가 이미 검증한 selected URL/signature를 버리고 transport layer가 raw JSON을 별도 parser로 다시 읽는 방식도 기각합니다. Metadata signature 또는 TUF류 protocol을 도입한다면 BandScope release/update owner에서 versioned contract와 key lifecycle, rotation/recovery, expiry/freeze semantics까지 함께 설계해야 하며 다른 bounded context에 검증 로직을 복제하지 않습니다.

TUF는 metadata 자체를 threshold signature로 인증하고 version rollback과 expiry/freeze를 확인하며 metadata download에도 명시적인 byte ceiling을 요구합니다. BandScope가 향후 TUF 또는 동등한 metadata-authentication 계층을 채택한다면 이 특성을 축소해서 "서명 하나 추가"로 대체하지 않습니다. 현재 구현은 TUF 준수를 주장하지 않습니다.

현재 `release/updater-policy.json`은 organization-approved updater public key와 production endpoint가 없어 `blocked`입니다. private key·public key·endpoint를 source에서 만들어내지 않습니다. Windows/macOS publisher identity와 notarization authority도 별도 외부 prerequisite입니다.

## 남은 runtime integration

Repository-owned 다음 단계는 다음 순서가 맞습니다.

- production HTTP adapter가 `ProvisionalUpdateMetadata::artifact_url()` / `artifact_signature()`를 소비하고 raw JSON을 재해석하지 않도록 연결
- response redirect/effective-origin과 실제 response byte stream을 `distribution-download`에 연결해 disk-full/cancel/network-error cleanup까지 검증
- remote metadata authenticity를 위한 canonical owner 계약과 verification path 결정 및 RED→GREEN 구현
- authenticated metadata와 같은 sealed descriptor에서 검증한 updater signature·digest·size binding
- 검증을 통과한 bytes에만 verified-artifact promotion 허용
- 그 이후에만 app-owned highest-seen state path와 `distribution-core`를 실제 updater flow에 연결
- offline update-check 실패가 normal startup을 막지 않는지 검증
- partial/truncated/oversized download, disk-full, cancel, first-launch failure 뒤 current installation/project 보존
- last-known-good installer retention과 project-schema-compatible rollback
- packaged Windows/macOS에서 wrong key/signature/digest/target/replay 및 power-loss acceptance

Positive production signature acceptance는 organization-approved updater authority가 provision된 뒤에만 수행합니다.

## Security Notes

Attack surface는 remote updater metadata, updater URL/destination, updater bytes/signatures, release receipts, locally persisted freshness state와 recovery decision입니다. Distribution만 이 trust chain을 소유합니다. Active Player, MIR, Project Persistence는 release/update authority를 복제하지 않습니다. Remote metadata는 bounded strict parser와 canonical release-namespace admission을 통과해도 provisional이며, authenticated evidence가 생기기 전 local freshness state를 mutate하지 않습니다. 원본 audio/project payload는 update metadata나 state에 포함하거나 endpoint로 전송하지 않습니다.

## 참고문헌

Samuel, J., Mathewson, N., Cappos, J., & Dingledine, R. (2010). *Survivable key compromise in software update systems*. Proceedings of the 17th ACM Conference on Computer and Communications Security, 61–72. https://ssl.engineering.nyu.edu/papers/samuel_tuf_ccs_2010.pdf

Tauri Contributors. (2026). *Updater*. Tauri v2 documentation. https://v2.tauri.app/plugin/updater/

Tauri Contributors. (2026). *Command line interface: signer*. Tauri v2 documentation. https://v2.tauri.app/reference/cli/

Tauri Contributors. (2026). *tauri-plugin-updater: updater.rs*. https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/updater/src/updater.rs

The Update Framework. (2026). *The Update Framework specification and security model*. https://theupdateframework.github.io/specification/draft/
