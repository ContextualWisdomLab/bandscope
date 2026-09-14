# Updater security metadata traceability

BandScope의 Distribution/update bounded context는 Tauri가 설치에 필요한 최소 정적 manifest와 BandScope가 재생·프로젝트 안전성 판단에 필요한 보안 메타데이터를 구분합니다. `latest.json`은 Tauri의 `version`, target별 `url`·`signature`를 유지하면서, exact release receipt에서 파생한 `bandscope` 확장 메타데이터를 함께 싣습니다.

## 문제

기존 `build_updater_manifest.py`는 exact tag URL과 `.sig` 내용을 receipt에 묶었지만, #960이 요구하는 updater artifact digest와 `minimumSupportedVersion`은 manifest에 없었습니다. 따라서 desktop runtime이 Tauri의 `Update.raw_json`을 사용해 replay/rollback 또는 compatibility 결정을 추가하더라도, 어떤 source commit과 어떤 updater bundle bytes가 제시됐는지 manifest 자체에서 확인할 수 없었습니다.

이 문제는 Tauri signature 검증과 별개입니다. Tauri updater는 update artifact signature 검증을 비활성화할 수 없고, static JSON에는 `version`, target별 `url`, `signature`가 필요합니다. 현재 Tauri API는 updater response의 원본 JSON을 `Update.raw_json`으로 보존하므로 제품별 추가 필드를 별도 updater protocol을 만들지 않고 소비할 수 있습니다.

## Manifest evidence

`build_updater_manifest.py`는 release graph를 `select_release_assets.py`로 다시 admit한 뒤 각 target receipt의 updater entry에서 다음 값을 `bandscope` 객체에 기록합니다.

- `schemaVersion: 1`
- exact 40-hex `sourceCommit`
- `release/updater-policy.json`의 `minimumSupportedVersion`
- Windows amd64/arm64, macOS amd64/arm64 각각의 exact updater bundle `sizeBytes`와 full SHA-256

정책 파일은 고정 repository-relative path에서 최대 64 KiB regular non-link file로 읽고, descriptor identity drift와 duplicate JSON member를 거부합니다. `minimumSupportedVersion`은 SemVer 형태를 다시 확인합니다. Receipt의 `sourceCommit`이 요청된 exact release commit과 다르면 manifest 생성을 중단합니다. 각 bundle size/digest도 positive integer와 full lowercase SHA-256 계약을 만족해야 합니다.

Manifest TDD lineage:

- RED `57ced89e61529a984010c8b351fef54cac543b6f`: static manifest가 exact source commit, policy version floor, target별 updater bundle size/full SHA-256을 노출해야 한다는 실행 계약을 추가했습니다.
- Fix `21ee4ff52789659cbf70db33c24d9e925fb8d4f1`: receipt/policy-derived `bandscope` metadata를 deterministic manifest에 결합하고 malformed policy·receipt identity를 fail closed 처리했습니다.
- Edge coverage `857e1e9324e29f896d5bad6216631bd723fd1f65`: duplicate policy authority와 non-canonical minimum version을 거부하도록 고정했습니다.

## Rust anti-replay / rollback decision core

Updater key와 production endpoint가 아직 provision되지 않았다고 해서 replay/rollback 정책 자체를 미룰 이유는 없습니다. 네트워크·Tauri·installer I/O에서 분리된 Rust-first policy core를 `apps/desktop/distribution-core`에 두고, 외부 authority가 생긴 뒤 runtime이 이 계약을 소비하도록 했습니다. Python은 repository CI에서 독립 Rust suite를 실행하는 validation boundary만 담당합니다.

`bandscope-distribution-core`는 다음을 fail closed로 결정합니다.

- stable channel version은 canonical numeric `MAJOR.MINOR.PATCH`만 허용합니다. `v` prefix, leading zero, prerelease/build metadata, whitespace와 numeric overflow를 거부합니다. Beta/prerelease channel이 필요하면 full SemVer 구현을 임의로 확장하지 않고 별도 ADR과 canonical parser를 도입해야 합니다.
- release identity는 exact 40 lowercase-hex source commit과 exact 64 lowercase-hex updater SHA-256을 요구합니다.
- target token은 bounded safe ASCII로 제한하고 현재 desktop target과 exact match해야 합니다.
- 현재 설치 버전보다 낮은 candidate는 `Rollback`, locally persisted highest-seen release보다 낮은 candidate는 `Replay`로 거부합니다.
- 동일 version이 다른 source commit 또는 artifact digest로 다시 나타나면 `Equivocation`으로 거부합니다.
- 동일한 highest-seen release를 사용자가 이전에 설치하지 않았거나 연기했더라도 재제안은 허용하되, 새 release처럼 freshness를 다시 부여하지 않습니다.
- 현재 client가 release의 `minimumSupportedVersion`보다 낮으면 automatic path를 거부하여 별도 recovery/manual upgrade 경로로 보냅니다.
- last-known-good rollback은 target version이 현재 설치본보다 실제로 오래되고, 해당 build가 현재 on-disk project schema를 읽을 수 있는 경우에만 허용합니다.

Highest-seen identity는 설치 완료 시점이 아니라 signature/metadata admission이 성공해 release를 신뢰한 시점에 Distribution-owned durable state로 기록해야 합니다. 사용자가 설치를 미뤘다는 이유로 같은 공격자-controlled metadata가 다시 fresh해지면 replay 방어가 성립하지 않기 때문입니다. Project Persistence는 project bytes/schema truth만 제공하며 updater freshness state를 소유하지 않습니다.

Runtime-core lineage:

- RED `4467a9e80b3fa7e7e7a95cb1ff7606749606b3d0`: repository CI가 독립 Rust Distribution suite를 `--locked --all-targets`로 실행하도록 요구했습니다.
- Crate/lock foundation `1339cfd44aef17743a770449651ee9a233baf4e5` / `0fbb2e8a5396e5b5b123704537e0c4b9719a92e3`: 다른 desktop bounded context나 Tauri/WebView에 의존하지 않는 standalone Rust core를 만들었습니다.
- Causal fix `42fdeed9a1ddf57d807889e61dee864b931b62a2`: version monotonicity, highest-seen replay/equivocation, target, compatibility floor와 project-schema-aware known-good rollback decision을 구현하고 hostile edge cases를 native unit test로 고정했습니다.

## Highest-seen durable state

Decision core만 있고 authenticated release identity를 restart 뒤 보존하지 않으면 replay 방어는 세션 경계에서 사라집니다. 이 state는 Project Persistence에 넣지 않고 Distribution 내부의 별도 `apps/desktop/distribution-state` crate가 소유합니다. `distribution-core`는 계속 filesystem-independent decision layer로 남고, state crate는 그 `ReleaseIdentity`만 소비합니다.

State format은 bounded append-only log입니다. 정상 record는 `v1|MAJOR.MINOR.PATCH|<40-hex source>|<64-hex updater sha256>\n`이며 최대 64 KiB만 허용합니다. Loader는 regular non-link file만 읽고 committed record를 모두 재검증합니다. version이 감소하거나 같은 version이 다시 committed되면 local authority corruption으로 fail closed합니다. 마지막 append가 crash 중 끊어진 경우에만, trailing bytes가 정확히 valid record prefix일 때 이전 committed highest identity를 복구합니다. 다음 successful append 전에 그 validated partial tail을 잘라냅니다.

`remember_highest_seen`은 lower release를 `Replay`, same-version/different-identity를 `Equivocation`으로 거부합니다. Exact same identity는 log를 늘리지 않는 idempotent no-op입니다. 새 record는 append 후 `sync_all()`이 성공하고 expected byte length가 확인되어야 성공으로 반환합니다. Unix에서는 최초 state-file 생성 시 parent directory도 동기화합니다. Windows에서 directory-entry power-loss semantics까지 source만으로 동일하게 주장하지 않으며, packaged fault-injection acceptance는 계속 남은 release gate입니다.

Durable-state lineage:

- RED `fa5690b53b776ef9d5b31b13b0285de384a53aaf`: repository validation이 별도의 locked `distribution-state` native suite를 요구하도록 확장했습니다.
- Foundation `f07f35ea68a4eee2e3fd8d7c90af0e778716a9e9` / `30159e004f7c8629ee47dcf89ae311cebf3fa1f7`: path-only dependency graph으로 state owner와 lockfile을 분리했습니다.
- Causal fix `95889b6a42ecb7452630f94dbff7a9b429e56bde`: bounded append/sync, monotonic/equivocation checks, recoverable torn-tail handling, regular-file/symlink/size admission과 native hostile-case tests를 구현했습니다.

이 state crate는 아직 Tauri `Update.raw_json`을 parse하거나 update check를 실행하지 않습니다. `release/updater-policy.json`이 `blocked`인 동안 fake endpoint/key를 만들어 positive runtime을 흉내 내지 않습니다. 다음 연결은 authenticated `raw_json` admission과 app-owned state path wiring이며, production signature acceptance는 실제 updater authority가 생긴 뒤에만 가능합니다.

## 보안 경계와 기각한 대안

이 메타데이터와 Rust decision/state core는 artifact identity와 anti-replay 판단의 입력·local memory이지 독립적인 서명 권위가 아닙니다. Tauri의 `.sig`는 updater bundle을 검증하고, GitHub immutable-release attestation은 published release asset 집합을 검증합니다. `bandscope` JSON 필드나 local state만 보고 signature validity나 repository compromise resilience를 주장하지 않습니다.

현재 `release/updater-policy.json`은 updater public key와 production endpoint가 provision되지 않아 `blocked`입니다. private key·public key·endpoint를 source에서 만들거나 추측하지 않습니다. `allowDowngrades` 또는 custom version comparator로 Tauri의 기본 forward version semantics를 약화하는 것도 채택하지 않았습니다.

TUF가 정의하는 rollback/freeze 계열 공격까지 완전히 방어했다고 주장하지 않습니다. TUF의 freshness/rollback 모델은 서명된 metadata version과 expiry를 포함하는 더 강한 repository metadata protocol입니다. BandScope는 현재 Tauri signed-artifact updater 위에 product-specific immutable evidence와 local highest-seen policy를 추가하는 단계이며, TUF와 동등한 metadata security model을 구현한 상태가 아닙니다.

## 남은 runtime integration

Repository-owned 다음 단계는 승인된 updater authority가 provision되었을 때 Tauri runtime과 durable Distribution state를 이 pure core에 연결하는 것입니다. 그 acceptance는 최소한 다음을 요구합니다.

- authenticated `Update.raw_json`에서 exact `bandscope` schema/target/artifact identity를 bounded parsing한 뒤 core에 전달
- `distribution-state`를 app-owned 경로에 연결하고 실제 packaged restart/power-loss에서 highest-seen reload 검증
- offline update-check 실패가 일반 startup을 막지 않음
- truncated/partial download, disk-full, cancel, first-launch failure 뒤 current installation과 project data 보존
- last-known-good installer retention 및 실제 rollback 전 project-schema compatibility 확인
- 잘못된 key/signature/digest, unsupported target, replay/stale metadata에 대한 packaged Windows/macOS acceptance

Positive production signature acceptance는 organization-approved updater public key/endpoint가 provision된 뒤에만 수행합니다.

## Security Notes

Attack surface는 remote updater metadata, release receipts, updater bundle identity, locally persisted freshness state와 recovery decision입니다. Distribution이 manifest publication과 update trust를 소유하며 Active Player, MIR, Project Persistence는 해당 권위를 복제하지 않습니다. 입력은 fixed-path/bounded/stable-descriptor admission과 exact digest로 제한하고 malformed authority는 fail closed 처리합니다. 원본 audio/project payload는 manifest나 updater state에 포함하거나 update endpoint로 전송하지 않습니다.

## 참고문헌

Samuel, J., Mathewson, N., Cappos, J., & Dingledine, R. (2010). *Survivable key compromise in software update systems*. Proceedings of the 17th ACM Conference on Computer and Communications Security, 61–72. https://ssl.engineering.nyu.edu/papers/samuel_tuf_ccs_2010.pdf

Tauri Contributors. (2026). *Updater*. Tauri v2 documentation. https://v2.tauri.app/plugin/updater/

The Update Framework. (2026). *The Update Framework specification and security model*. https://theupdateframework.github.io/
