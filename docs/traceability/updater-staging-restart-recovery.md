# Updater staging restart recovery traceability

BandScope의 updater staging은 신뢰 검증 전 bytes만 두는 scratch namespace입니다. 정상 cancel/error/drop에서는 partial file을 제거하지만 프로세스 강제 종료나 전원 상실은 Rust `Drop`을 실행하지 않을 수 있습니다. 반대로 살아 있는 다른 BandScope 인스턴스의 regular staging file을 crash residue로 오인해 지우면 안 됩니다. Restart recovery와 concurrent ownership을 함께 만족해야 합니다.

## 문제와 제약

최초 구현은 `create_new`만 사용했기 때문에 crash 뒤 남은 regular child가 다음 동일 업데이트를 영구적으로 `DestinationExists`에 가둘 수 있었습니다. 이를 고친 `b7a1839d5941c52800bbeaf22921e143060d1ff6`는 app-owned staging의 pre-existing regular child를 stale unverified bytes로 보고 제거했습니다.

그 수리만으로는 충분하지 않았습니다. 다른 BandScope 프로세스가 같은 basename을 실제로 staging 중이어도 pathname만 보면 regular file이므로 두 번째 프로세스가 이를 stale로 오인해 unlink할 수 있었습니다. Unix에서는 첫 번째 writer가 이미 unlink된 inode에 계속 쓸 수 있고 두 번째 writer는 같은 pathname에 새 inode를 만들 수 있어, 두 live attempts가 서로 다른 bytes를 같은 logical staging identity로 취급할 수 있습니다. 첫 writer의 drop cleanup이 뒤늦게 두 번째 writer의 pathname을 제거할 위험도 있습니다. Windows의 open-file 삭제 동작과도 결과가 달라질 수 있어 cross-platform recovery contract로 둘 수 없습니다.

Stale bytes를 resume하거나 신뢰하는 것도 허용하지 않습니다. 이전 프로세스가 남긴 bytes에는 response completion, digest, updater signature, metadata authenticity 증거가 없습니다. 이 namespace에는 verified artifact를 장기 보존하지 않으며, 향후 promotion은 별도 retained/known-good owner가 맡습니다.

## RED → causal fix

- Restart RED `5b0ddb585ee1eb7ddadaa66eeab267c6f55d6467`: 이전 프로세스가 남긴 `update.bin` regular file은 재사용하지 않고 byte zero부터 새 exclusive attempt로 교체해야 하며 destination symlink는 stale regular file로 오인하지 않아야 한다는 계약을 추가했습니다.
- Restart causal fix `b7a1839d5941c52800bbeaf22921e143060d1ff6`: exact direct child가 regular file일 때만 stale unverified scratch로 제거한 뒤 `create_new`로 새 descriptor를 만듭니다. Symlink·directory·기타 non-regular object는 fail closed합니다.
- Concurrent-writer RED `82843b4833df264aa6d5530d9f46545b1179a0bb`: 첫 `StagedArtifactFile`이 partial bytes를 쓰고 살아 있는 동안 같은 staging namespace에서 두 번째 attempt가 기존 pathname을 reclaim해서는 안 되며 `ConcurrentAttempt`로 실패해야 한다는 계약을 추가했습니다. 기존 stale-recovery 구현은 live regular child도 삭제하므로 이 계약을 만족하지 못합니다.
- Causal fix `40cd7543fab6ac6cb203e310b16058645edcedae`: stale-file 분류보다 먼저 app-owned staging directory의 persistent `.bandscope-staging.lock`을 열고 `File::try_lock()` exclusive lease를 취득합니다. 이미 다른 BandScope handle/process가 lease를 갖고 있으면 `ConcurrentAttempt`로 fail closed합니다. Lease는 staged descriptor와 함께 유지되고 `seal` 시 `SealedArtifactFile`로 이동하여 digest/signature verification 전까지 같은 scratch namespace를 보호합니다. Artifact cleanup이 끝난 뒤 handle을 닫아 lease를 해제합니다.
- Fixture adaptation `ebf94287ea54d329a3276f02a5251054c9b2d20c`: persistent lease sentinel은 crash-safe coordination object이므로 test teardown이 artifact cleanup과 sentinel cleanup을 구분하도록 고쳤습니다.
- Edge coverage `d2d187288ef27e7fabdacde062d83423bfa2e243`: sealed-but-unverified 상태에서도 lease가 유지되는지, drop 이후 새 attempt가 가능한지, Unix에서 lease sentinel symlink를 따라가지 않는지를 고정했습니다.
- Cross-platform fixture hardening `752b5343c809b8e8f76a9886295de42e19ebc3ff`: Rust가 file lock과 ordinary read/write의 상호작용을 platform-specific으로 명시하므로, lease를 보유한 sealed artifact를 별도 pathname handle로 읽는 테스트 가정을 제거하고 path 존재/ownership과 `ConcurrentAttempt`만 검증하도록 고쳤습니다. Product code나 trust semantics는 바꾸지 않습니다.
- Platform-evidence RED `41afd2abb6f3beeded35d2576f3f1e9532b75ce3`: Ubuntu-only native-suite execution만으로 Windows/macOS file-lock semantics를 release evidence로 삼지 못하도록, `ci.yml`이 Linux·Windows·macOS에서 exact `distribution-download` locked all-target test를 실행하고 protected `ci / build-and-test`가 그 matrix를 선행조건으로 가져야 한다는 repository contract를 추가했습니다.
- Platform-evidence fix `cfb3ec11503fd8b7abafce05f07ea916cc34153c`: `distribution-download-platform` CI matrix를 `ubuntu-latest`, `windows-2025`, `macos-15`로 추가하고 각 runner에서 `cargo +stable test --manifest-path apps/desktop/distribution-download/Cargo.toml --locked --all-targets`를 실행합니다. Main `ci / build-and-test`는 이 matrix와 npm lock validation을 모두 `needs`로 요구하므로 platform lease test가 실패한 상태에서 required main CI gate가 성공할 수 없습니다.
- Real-process coverage `44265a038bf1c162df15539de0bcfaaf6f286bea`: same-process handle contention만으로 process coordination을 추정하지 않도록 integration test가 현재 test binary를 별도 child process로 실행합니다. Child가 실제 staging lease와 artifact를 보유한 뒤 readiness signal을 내고, parent는 같은 staging namespace의 create가 `ConcurrentAttempt`로 실패하며 pathname이 보존되는지 확인합니다. Child process가 lease를 해제한 뒤 parent fresh attempt가 성공해야 test가 끝납니다. 이 test도 위 OS matrix에서 실행됩니다.

## 실행 계약

- artifact basename을 검사하고 staging root가 direct non-symlink directory인지 확인한 뒤, stale artifact pathname을 읽거나 제거하기 전에 staging lease를 먼저 취득합니다.
- `.bandscope-staging.lock`은 조정용 sentinel입니다. 파일 내용은 trust evidence가 아니며 읽거나 해석하지 않습니다. Sentinel pathname은 정상 종료 뒤에도 남아 있을 수 있고, 실제 active ownership은 OS file lock으로 표현합니다.
- lease sentinel이 symlink 또는 non-regular object이면 이를 따라가거나 교체하지 않고 fail closed합니다.
- 다른 cooperating BandScope handle/process가 lease를 보유하면 `StagedArtifactFile::create`는 `ConcurrentAttempt`로 종료하며 기존 staging artifact를 건드리지 않습니다.
- lease를 획득한 뒤에만 pre-existing regular artifact를 이전 crash의 unverified residue로 간주할 수 있습니다. 해당 bytes는 resume하지 않고 제거한 뒤 `create_new`로 byte zero부터 시작합니다.
- `StagedArtifactFile`에서 `SealedArtifactFile`로 전환해도 lease를 유지합니다. Exact descriptor의 digest/signature 검증과 cleanup 사이에 다른 attempt가 pathname을 reclaim하지 못하게 하는 목적입니다.
- staged/sealed artifact cleanup을 마친 뒤 lease handle이 닫히며 다음 attempt가 lease를 얻을 수 있습니다. Process termination 시 OS가 file handle을 닫으면 lock도 함께 해제되므로 persistent sentinel 자체가 영구 blocker가 되지 않습니다.
- symlink, directory 또는 기타 non-regular artifact destination은 자동 삭제하지 않습니다.
- verified artifact를 이 scratch namespace에 장기 보존하는 API는 없습니다.
- platform-specific lock behavior를 Linux-only unit evidence로 일반화하지 않습니다. Distribution staging/lease integration suite는 Linux·Windows·macOS hosted runner에서 exact-head 실행되어야 하며 main `ci / build-and-test`는 그 matrix를 통과한 뒤에만 시작할 수 있습니다.
- process-ownership claim은 별도 OS process가 lease를 보유하는 integration case를 포함해야 합니다. 같은 test process 안의 두 file handle만으로 cross-process exclusion을 증명했다고 보지 않습니다.

## 선택과 기각한 대안

Artifact file 자체만 advisory-lock하는 방식은 선택하지 않았습니다. `create_new`와 lock 획득 사이에는 별도 process가 새 pathname을 관찰할 수 있어 create+lock을 하나의 portable atomic operation으로 만들 수 없고, stale classification과 live ownership을 안정적으로 직렬화하지 못합니다.

기존 regular file을 그대로 열어 resume하는 방식도 기각합니다. 어느 byte까지 authenticated response였는지, 이전 process가 어떤 metadata/signature를 사용했는지 증명할 수 없고 partial bytes를 새 response와 혼합할 수 있습니다.

`truncate(true)` 또는 overwrite-open으로 기존 artifact path를 바로 재사용하는 방식도 기각합니다. Symlink/non-regular destination을 따라가거나 덮어쓸 수 있고 exclusive ownership 증거가 약해집니다.

Lease sentinel을 정상 drop마다 삭제하는 방식도 사용하지 않습니다. Lock holder가 sentinel pathname을 unlink하면 다른 process가 새 sentinel inode를 만들 수 있고, 기존 inode를 열어 기다리던 process와 lock domain이 갈라질 수 있습니다. Sentinel은 남겨 두고 OS lock의 보유 여부만 active ownership으로 사용합니다.

Linux CI 한 곳에서만 lock suite를 실행하고 Windows/macOS 동작을 문서상 동일하다고 간주하는 방식도 기각합니다. Rust 자체가 file lock 구현과 read/write 상호작용을 platform-specific이라고 명시하므로, 판매 대상 desktop OS family에서 실행 evidence를 직접 확보해야 합니다.

Same-process handle contention만으로 process-level lease를 증명하는 방식도 기각합니다. OS lock의 handle/process semantics는 platform-specific할 수 있으므로 별도 process가 실제 lock owner일 때의 exclusion과 release를 각 판매 대상 OS runner에서 실행합니다.

## Claim boundary

이 수리는 **cooperating BandScope processes 사이에서 active staging attempt를 crash residue로 오인해 reclaim하는 source-level race**와 restart 뒤 stale regular file이 동일 update를 영구 차단하는 경로를 함께 닫습니다. `File::try_lock`은 플랫폼에 따라 advisory 또는 mandatory일 수 있으므로, 이 lease가 임의의 로컬 악성 프로세스가 직접 filesystem을 변조하는 것을 막는 mandatory sandbox라고 주장하지 않습니다. Staging root 자체의 ACL/ownership hardening과 pathname TOCTOU 방어도 별도 security boundary입니다.

Cross-platform CI matrix와 real-process test는 Windows/macOS/Linux에서 현재 cooperating-process exclusion contract가 실행된다는 evidence gate입니다. Packaged application process kill, power loss, disk-full, antivirus/file-lock, filesystem crash가 모두 검증됐다는 뜻은 아닙니다. Production HTTP adapter, cryptographic verification, verified-artifact promotion과 last-known-good retention은 별도 release gate입니다.

## 근거

Rust Project. (2026). *std::fs::File::try_lock and TryLockError* (Rust 1.98.1 standard library). https://doc.rust-lang.org/std/fs/struct.File.html#method.try_lock

Rust 표준 라이브러리는 `File::try_lock`/`TryLockError`를 Rust 1.89.0부터 stable로 제공하며, 다른 handle/process가 lock을 보유하면 `WouldBlock`으로 구분합니다. File handle이 닫히면 lock이 해제되고 Unix에서는 `flock`, Windows에서는 `LockFileEx` 계열에 대응하지만 ordinary read/write와의 세부 상호작용은 platform-specific이라고 명시합니다. BandScope는 이 API를 cooperating updater process 간 lease로만 사용하며 테스트도 lock 보유 중 별도 file read 가능성을 전제로 하지 않습니다.

## Security Notes

Staging bytes는 canonical release namespace에서 왔더라도 verification 전까지 untrusted입니다. Restart recovery는 stale bytes를 살리는 기능이 아니라 active owner가 없음을 lease로 확인한 뒤 제거하고 새 admission을 시작하는 기능입니다. Lease sentinel과 artifact destination의 symlink/non-regular object는 자동 정리 대상이 아닙니다. Verified artifact는 staging scratch 밖의 별도 owner로 승격되어야 하며 audio/project content는 이 updater staging 경계에 들어오지 않습니다.