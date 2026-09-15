# Updater highest-seen state concurrency traceability

## 문제

`bandscope-distribution-state`의 append-only log는 torn final write와 단일 호출 내부의 길이 변화는 검사했지만, 두 BandScope 프로세스가 같은 freshness state를 동시에 갱신하는 경우를 직렬화하지 않았습니다. 두 writer가 같은 committed snapshot을 읽은 뒤 각각 다음 release record를 append하면, append 자체는 모두 성공할 수 있지만 이후 parser는 동일 version의 두 committed record를 equivocation/corruption으로 거부합니다. 더 위험한 경우에는 reader가 writer의 append 직전 snapshot을 정상 값으로 반환해 anti-replay 판단이 이미 진행 중인 다른 프로세스의 최신 authority보다 뒤처질 수 있습니다.

이 문제는 네트워크 metadata나 updater signature의 진위와 별개입니다. `distribution-state`가 실제 flow에 연결되는 시점에는 이미 인증된 release identity만 받더라도, 로컬 freshness authority 자체가 다중 프로세스에서 일관되어야 합니다.

추가 review에서 pathname admission에도 별도 결함이 확인됐습니다. Symlink와 non-regular entry만 거부하면 hard link는 정상 regular file로 보입니다. 공격 또는 잘못된 local-data 조작으로 `highest-seen.log`가 다른 파일과 같은 inode/file record를 공유하면, BandScope의 recoverable-tail truncation이나 monotonic append가 그 다른 pathname이 가리키는 동일 파일 내용까지 변경할 수 있습니다. Anti-replay authority는 app-owned 단일 state object여야 하므로 pre-existing multi-link state는 정상 authority로 인정하지 않습니다.

## RED와 수정

- RED `e25fd44daa62f994d40a378de8c06a87eed5fb86`은 sibling lease를 다른 handle이 보유한 동안 `load_highest_seen()`과 `remember_highest_seen()`이 진행되면 안 된다는 cross-process contract를 추가했습니다. 선행 구현은 lease를 전혀 확인하지 않아 write를 수행하고 state file까지 만들 수 있었습니다.
- Causal fix `dd2ae7f45468ad06bf50a83d279dcb8facf1d783`은 state file과 같은 directory의 `.bandscope-highest-seen.lock`을 열고 `File::try_lock()`의 exclusive OS lock을 획득한 뒤에만 read/repair/append를 시작합니다. `remember_highest_seen()`은 최초 state read부터 recoverable-tail truncation, append, `sync_all()` 및 final length 확인까지 같은 lease를 유지합니다. `load_highest_seen()`도 같은 lease를 사용해 concurrent writer와 stale read가 겹치지 않게 합니다.
- 기존 `StateError::ConcurrentMutation`을 lease contention에도 사용합니다. 호출자는 이를 freshness authority를 읽거나 갱신할 수 없는 fail-closed 상태로 이미 취급할 수 있으므로 별도 public error family를 만들지 않았습니다.
- RED `b6334829b474a60ba2ad0e7a7d77ec93822b20f2`는 정상 highest-seen 파일의 hard link를 app-owned state pathname에 만든 뒤, read와 다음-release append가 모두 `StateError::NotRegularFile`로 거부되고 원본 alias bytes가 바뀌지 않아야 한다는 contract를 추가했습니다. 선행 구현은 hard link를 regular file로 받아들여 이 계약을 만족하지 못했습니다.
- Causal fix `4f8c9336141456ad9f669f88fa5373aa7902c9ca`는 state pathname metadata와 실제 opened descriptor metadata 양쪽에서 filesystem link count가 정확히 1인지 확인합니다. Unix는 `MetadataExt::nlink()`, Windows는 `MetadataExt::number_of_links()`를 사용하고, 이 정보를 제공하지 않는 target은 freshness authority를 추측하지 않고 fail closed합니다.

## 제약과 대안

State log 자체를 lock 대상으로 쓰는 방식은 최초 state file이 아직 없을 때와 torn-tail repair에서 lifecycle이 복잡해져 기각했습니다. Process-local mutex만 두는 방식도 별도 desktop process를 직렬화하지 못하므로 기각했습니다. Blocking lock으로 무기한 대기하는 방식 대신 non-blocking `try_lock()`을 사용합니다. updater freshness mutation은 UI hot path가 아니며, lock contention은 다른 프로세스가 authority를 갱신 중이라는 명시적 상태이므로 bounded failure 후 상위 orchestration에서 재시도 여부를 결정하는 편이 낫습니다.

Lock file은 crash 뒤에도 남을 수 있지만 lock ownership은 open file handle에 결합되므로 stale pathname 자체를 writer ownership으로 간주하지 않습니다. Existing regular lock file을 다시 열어 OS lock 획득을 시도합니다. Symlink 또는 non-regular lease path는 fail closed합니다.

Hard-link alias를 pathname canonicalization으로 찾는 방식은 기각했습니다. Canonical path는 동일 inode의 다른 directory entry 존재 여부를 증명하지 못합니다. App-local tree를 순회해 모든 alias를 찾는 방식도 동일 filesystem 전체를 증명할 수 없고 race가 남습니다. State authority 자체에서 OS metadata의 link count를 검사하는 것이 더 작고 직접적인 invariant입니다.

## Claim boundary와 위험

이 변경은 cooperating BandScope processes의 highest-seen read/write를 직렬화하고, admission 시점에 이미 여러 pathname을 가진 state object를 freshness authority로 사용하지 않게 합니다. Advisory file locking을 무시하고 app-local-data directory를 직접 변조할 수 있는 동일 사용자/관리자 프로세스로부터 state를 완전히 보호한다고 주장하지 않습니다. 특히 정상 single-link file이 검사된 뒤 hostile actor가 hard link를 추가하거나 pathname을 교체하는 TOCTOU까지 이번 변경이 제거하지는 않습니다. Rust 표준 라이브러리도 filesystem operation 전반의 TOCTOU 가능성을 명시하므로 descriptor-relative/path-identity hardening과 packaged hostile-race acceptance는 후속 범위입니다.

`try_lock()`은 2026-09 현재 Rust stable 표준 라이브러리에서 제공되며, 다른 handle/process가 lock을 보유하면 `TryLockError::WouldBlock`을 반환합니다. Rust 1.98.1의 Unix `MetadataExt`는 `nlink()`를, Windows `MetadataExt`는 `number_of_links()`를 제공하므로 supported desktop targets에서 pre-existing hard-link alias를 direct metadata로 검사할 수 있습니다. BandScope가 지원하는 desktop build는 repository의 cross-platform CI에서 이 계약을 다시 실행해야 합니다. 네트워크 filesystem/SMB/NFS는 lock/link semantics가 달라질 수 있으므로 commercial acceptance는 app-local state가 실제 supported local profile/storage에서 동작하는 조건으로 검증합니다.

## 효과와 후속조치

두 앱 인스턴스가 같은 authenticated release에서 출발해 동일 또는 서로 다른 다음 release를 동시에 append하여 durable log를 자가-corrupt시키는 경로와, pre-existing hard-linked state pathname을 통해 다른 alias의 bytes를 freshness repair/append가 변경하는 경로를 닫았습니다. Remote metadata authenticity, updater signature verification, exact sealed-descriptor digest/size binding, verified-artifact promotion이 완료되기 전에는 이 state writer를 production updater flow에 연결하지 않는 기존 trust order는 그대로입니다.

후속 acceptance는 Windows/macOS에서 실제 두 프로세스 contention, process-kill 직후 lock release, torn tail + contention, hard-link fixture, pathname replacement race, power-loss/restart를 packaged build로 검증해야 합니다. Production HTTP adapter와 metadata authentication은 별도 Distribution vertical입니다.

## Security Notes

Attack surface는 app-local freshness log와 sibling lease pathname입니다. Lease contention은 성공으로 우회하지 않고 `ConcurrentMutation`으로 fail closed합니다. Existing state는 symlink/non-regular뿐 아니라 multi-link object도 거부합니다. Lock file에는 release identity, project/audio path, credential, signature나 PII를 기록하지 않습니다. State log의 resource/record validation과 append durability는 유지됩니다. 이번 link-count admission은 static multi-link alias를 차단하는 통제이며 privileged/same-user hostile filesystem race에 대한 완전한 sandbox 경계로 취급하지 않습니다.

## 참고문헌

Rust Project. (2026). *std::fs: Filesystem manipulation operations*. Rust 1.98.1 standard library documentation. https://doc.rust-lang.org/std/fs/

Rust Project. (2026). *MetadataExt in std::os::unix::fs*. Rust 1.98.1 standard library documentation. https://doc.rust-lang.org/std/os/unix/fs/trait.MetadataExt.html

Rust Project. (2026). *MetadataExt in std::os::windows::fs*. Rust 1.98.1 standard library documentation. https://doc.rust-lang.org/std/os/windows/fs/trait.MetadataExt.html

Rust Project. (2026). *TryLockError in std::fs*. Rust 1.98.1 standard library documentation. https://doc.rust-lang.org/std/fs/enum.TryLockError.html

Kerrisk, M. (2026). *flock(2) — apply or remove an advisory lock on an open file*. Linux man-pages project. https://man7.org/linux/man-pages/man2/flock.2.html
