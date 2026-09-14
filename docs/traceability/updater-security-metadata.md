# Updater security metadata traceability

BandScope의 Distribution/update bounded context는 Tauri가 설치에 필요한 최소 정적 manifest와 BandScope가 재생·프로젝트 안전성 판단에 필요한 보안 메타데이터를 구분합니다. `latest.json`은 Tauri의 `version`, target별 `url`·`signature`를 유지하면서, exact release receipt에서 파생한 `bandscope` 확장 메타데이터를 함께 싣습니다.

## 문제

기존 `build_updater_manifest.py`는 exact tag URL과 `.sig` 내용을 receipt에 묶었지만, #960이 요구하는 updater artifact digest와 `minimumSupportedVersion`은 manifest에 없었습니다. 따라서 향후 desktop runtime이 Tauri의 `Update.raw_json`을 사용해 replay/rollback 또는 compatibility 결정을 추가하더라도, 어떤 source commit과 어떤 updater bundle bytes가 제시됐는지 manifest 자체에서 확인할 수 없었습니다.

이 문제는 Tauri signature 검증과 별개입니다. Tauri updater는 update artifact signature 검증을 비활성화할 수 없고, static JSON에는 `version`, target별 `url`, `signature`가 필요합니다. 동시에 현재 Tauri API는 updater response의 원본 JSON을 `Update.raw_json`으로 보존하므로 제품별 추가 필드를 별도 updater protocol을 만들지 않고 소비할 수 있습니다.

## 구현

`build_updater_manifest.py`는 release graph를 `select_release_assets.py`로 다시 admit한 뒤 각 target receipt의 updater entry에서 다음 값을 `bandscope` 객체에 기록합니다.

- `schemaVersion: 1`
- exact 40-hex `sourceCommit`
- `release/updater-policy.json`의 `minimumSupportedVersion`
- Windows amd64/arm64, macOS amd64/arm64 각각의 exact updater bundle `sizeBytes`와 full SHA-256

정책 파일은 고정 repository-relative path에서 최대 64 KiB regular non-link file로 읽고, descriptor identity drift와 duplicate JSON member를 거부합니다. `minimumSupportedVersion`은 SemVer 형태를 다시 확인합니다. Receipt의 `sourceCommit`이 요청된 exact release commit과 다르면 manifest 생성을 중단합니다. 각 bundle size/digest도 positive integer와 full lowercase SHA-256 계약을 만족해야 합니다.

TDD lineage:

- RED `57ced89e61529a984010c8b351fef54cac543b6f`: static manifest가 exact source commit, policy version floor, target별 updater bundle size/full SHA-256을 노출해야 한다는 실행 계약을 추가했습니다.
- Fix `21ee4ff52789659cbf70db33c24d9e925fb8d4f1`: receipt/policy-derived `bandscope` metadata를 deterministic manifest에 결합하고 malformed policy·receipt identity를 fail closed 처리했습니다.

## 보안 경계

이 메타데이터는 artifact identity와 향후 anti-replay 판단의 입력이지, 독립적인 서명 권위가 아닙니다. Tauri의 `.sig`는 updater bundle을 검증하고, GitHub immutable-release attestation은 published release asset 집합을 검증합니다. `bandscope` JSON 필드만 보고 signature validity나 repository compromise resilience를 주장하지 않습니다.

현재 `release/updater-policy.json`은 updater public key와 production endpoint가 provision되지 않아 `blocked`입니다. 따라서 이 slice는 updater를 활성화하지 않고, private key·public key·endpoint를 만들거나 추측하지 않습니다. 실제 runtime anti-replay는 승인된 updater authority가 생긴 뒤 Tauri의 기본 SemVer 비교를 약화하지 않은 채 `Update.raw_json`의 exact metadata와 locally persisted highest-seen evidence를 결합해야 합니다.

TUF가 정의하는 rollback/freeze 계열 공격까지 완전히 방어했다고 주장하지 않습니다. TUF의 freshness/rollback 모델은 서명된 metadata version과 expiry를 포함하는 더 강한 repository metadata protocol입니다. BandScope는 현재 Tauri signed-artifact updater 위에 제품별 evidence를 추가하는 단계이며, TUF와 동등한 metadata security model을 구현한 상태가 아닙니다.

## 다음 단계

Repository-owned 다음 slice는 실제 runtime decision/state machine입니다. 최소한 다음을 별도 RED로 요구합니다.

- 현재 설치 버전보다 낮은 SemVer를 자동 설치하지 않음
- 사용자가 이전에 관측한 highest-seen release보다 낮은 metadata를 replay로 거부
- target/architecture mismatch 및 malformed/truncated metadata 거부
- offline update-check 실패가 일반 startup을 막지 않음
- failed/cancelled install 뒤 last-known-good installer와 project data를 보존
- rollback target이 현재 on-disk project schema를 읽을 수 없으면 자동 downgrade 금지

`allowDowngrades` 또는 custom version comparator를 사용해 Tauri의 기본 버전 비교를 우회하는 방식은 recovery 설계가 끝나기 전에는 채택하지 않습니다.

## Security Notes

Attack surface는 remote updater metadata, release receipts, updater bundle identity와 이후 runtime update decision입니다. Distribution이 manifest publication과 update trust를 소유하며 Active Player, MIR, Project Persistence는 해당 권위를 복제하지 않습니다. 입력은 fixed-path/bounded/stable-descriptor admission과 exact digest로 제한하고 오류는 release publication 실패로 처리합니다. 원본 audio/project payload는 manifest에 포함하거나 update endpoint로 전송하지 않습니다.

## 참고문헌

Samuel, J., Mathewson, N., Cappos, J., & Dingledine, R. (2010). *Survivable key compromise in software update systems*. Proceedings of the 17th ACM Conference on Computer and Communications Security, 61–72. https://ssl.engineering.nyu.edu/papers/samuel_tuf_ccs_2010.pdf

Tauri Contributors. (2026). *Updater*. Tauri v2 documentation. https://v2.tauri.app/plugin/updater/

The Update Framework. (2026). *The Update Framework specification and security model*. https://theupdateframework.github.io/
