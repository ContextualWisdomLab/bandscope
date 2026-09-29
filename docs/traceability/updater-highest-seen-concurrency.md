# Updater highest-seen state concurrency traceability

## 문제

`bandscope-distribution-state`는 authenticated release의 highest-seen identity를 app-local state로 보존합니다. 이 authority가 두 desktop process 사이에서 직렬화되지 않으면 두 writer가 같은 snapshot에서 출발해 중복/충돌 record를 만들거나 reader가 concurrent update 직전 값을 정상 authority로 사용할 수 있습니다. 그래서 최초 read부터 tail repair, commit, sync까지 sibling OS lease가 필요합니다.

별도 filesystem finding도 있습니다. Unix에서 `highest-seen.log`가 다른 pathname과 hard link로 같은 inode를 공유한 채 in-place truncate/append되면 BandScope가 다른 alias의 bytes까지 변경할 수 있습니다. Windows에서는 같은 문제를 해결하려고 `std::os::windows::fs::MetadataExt::number_of_links()`를 직접 사용했던 선행 수리가 있었지만, Rust 1.98.1은 이 API를 nightly-only `windows_by_handle` 기능으로 문서화합니다. Hosted Distribution lane은 의도적으로 `cargo +stable`을 사용하므로 그 구현은 commercial evidence가 될 수 없었습니다.

## 결정

Process serialization은 기존 sibling lease를 유지합니다. `load_highest_seen()`과 `remember_highest_seen()`은 `.bandscope-highest-seen.lock`에 `File::try_lock()`을 획득한 뒤에만 state를 읽거나 갱신합니다. Contention은 `StateError::ConcurrentMutation`으로 fail closed합니다.

Filesystem alias 통제는 OS capability에 맞게 다르게 구현합니다.

- **Unix/macOS/Linux**: pathname metadata와 opened descriptor 모두 stable `MetadataExt::nlink() == 1`이어야 합니다. Existing multi-link state는 `NotRegularFile`로 거부하고 기존 append/torn-tail truncation semantics를 유지합니다.
- **Windows**: stable Rust에서 link count를 읽는다고 가장하지 않습니다. Existing state는 read-only admission 후, mutation이 필요할 때 current committed log bytes를 sibling `.bandscope-highest-seen.next`에 `create_new`로 작성하고 `sync_all()`한 다음 `std::fs::rename()`으로 state pathname만 교체합니다. 따라서 pre-existing hard-link alias가 있더라도 alias가 가리키는 기존 file record를 truncate/append하지 않습니다. Exact-repeat with no torn tail is write-free. Recoverable tail repair도 same-path truncation 대신 synchronized snapshot replacement를 사용합니다.

Rust `std::fs::rename`은 destination이 존재하면 replacement semantics를 제공하며, Windows 10 1607+에서는 지원 filesystem에서 `FileRenameInfoEx` 기반으로 Unix와 같은 replacement behavior를 사용합니다. 이 선택은 nightly toolchain, shell command, unsafe FFI를 도입하지 않고 stable owner code에서 alias mutation을 피하기 위한 것입니다.

## RED와 수리 lineage

- `e25fd44daa62f994d40a378de8c06a87eed5fb86`: sibling lease contention에서 reader/writer가 진행하면 안 된다는 cross-process RED.
- `dd2ae7f45468ad06bf50a83d279dcb8facf1d783`: state read/repair/append 전체를 sibling OS lease로 직렬화.
- `b6334829b474a60ba2ad0e7a7d77ec93822b20f2`: pre-existing hard-link alias가 다른 pathname bytes를 변경할 수 있다는 filesystem RED.
- `4f8c9336141456ad9f669f88fa5373aa7902c9ca`: Unix/Windows link-count admission을 처음 도입했으나, Windows `number_of_links()`가 stable API가 아니라는 후속 finding이 남음.
- #1220: stable Windows CI와 nightly-only `windows_by_handle` 사용 불일치를 repair finding으로 승격.
- `e07a50ddc343a43e525ccd9c9e6c621f3abfe8df`: Windows mutation을 in-place append/truncate에서 synchronized sibling snapshot + pathname replacement로 전환하고 nightly-only metadata call을 제거.
- `53037926b0d09ccc2b05cebc5b864c47e20ae620`: direct link-count rejection contract를 Unix로 한정.
- `2f231d65c0736abfb83feb9223c008357457e5f7`: Windows에서 hard-linked existing state의 monotonic update와 torn-tail repair가 alias bytes를 변경하지 않고 state pathname만 새 committed snapshot으로 전진해야 한다는 platform contract 추가.
- `8832e62fcc2e711a325d1468f836c06ba91bca33` → `c5a09d5c0d14dbdba776997ba920dd99dbbba2cf`: state/runtime/transport standalone owners를 Ubuntu, Windows 2025, macOS 15에서 exact stable cargo tests로 실행하고 final `ci / build-and-test`가 이 lane에 의존하도록 hosted evidence graph를 수리.

## 대안과 기각 이유

Windows CI를 nightly로 바꾸는 방식은 repository toolchain contract를 한 platform metadata helper 때문에 약화하므로 기각했습니다. Windows test만 제외하는 방식은 protected evidence를 줄이므로 기각했습니다. Link count를 확인하지 못하면서 unconditional `true`를 반환하고 기존 in-place append/truncation을 유지하는 방식도 alias mutation을 그대로 남기므로 기각했습니다.

`fsutil`/PowerShell을 runtime에서 호출하는 방식은 locale, binary availability, process execution surface와 operational dependency를 freshness state에 추가하므로 기각했습니다. Win32 FFI를 owner code에 직접 추가하는 방식도 crate의 `unsafe_code = "forbid"` 경계를 깨므로 채택하지 않았습니다. 새로운 safe dependency를 도입하는 방안은 가능하지만 현재 문제는 std-only snapshot publication으로 해결할 수 있어 dependency-policy 비용을 만들 이유가 없습니다.

Windows에서도 물리적 append-only file을 고집하는 방식보다, logical committed log bytes를 synchronized sibling에 작성하고 pathname replacement하는 방식을 선택했습니다. Anti-replay 판단에 필요한 것은 ordered committed records와 crash-safe previous authority 보존이지, 동일 file record에 대한 in-place append 자체가 아닙니다.

## Claim boundary와 위험

Sibling lease는 cooperating BandScope processes를 직렬화합니다. Advisory lock을 무시하고 app-local directory를 직접 조작할 수 있는 동일 사용자/관리자 actor에 대한 sandbox 경계로 보지 않습니다.

Unix link-count admission은 검사 시점의 pre-existing alias를 차단하지만 검사 이후 hostile hard-link/path replacement TOCTOU를 완전히 제거하지 않습니다. Windows snapshot publication은 pre-existing hard-link alias를 in-place 변경하지 않지만, sibling scratch pathname과 final rename 주변의 hostile same-user race를 cryptographic filesystem capability로 제거한 것은 아닙니다.

Windows에서 `File::sync_all()`은 snapshot file content durability를 요청하지만 Rust std는 이번 owner에서 parent-directory durability를 Unix와 동일 방식으로 증명하지 않습니다. 따라서 packaged Windows process-kill/power-loss acceptance가 통과하기 전에는 full crash/power-loss durability를 주장하지 않습니다. Network filesystem/SMB/NFS semantics도 commercial local-profile acceptance 범위 밖에서 별도 검증이 필요합니다.

`load_highest_seen()`은 Windows hard-linked state를 read-only로 받아들일 수 있습니다. BandScope-owned mutation은 alias file record를 수정하지 않으며 다음 real update 또는 torn-tail repair에서 state pathname을 독립 snapshot으로 교체합니다. Same-user external alias writer가 lease를 무시하고 bytes를 동시에 바꾸는 공격은 별도 hostile-filesystem boundary입니다.

## 효과와 후속조치

정상 cooperating desktop processes는 하나의 freshness authority를 순차적으로 읽고 갱신합니다. Unix는 existing multi-link state를 거부하고, Windows는 stable Rust에서 alias file record를 직접 변경하지 않는 publication semantics를 사용합니다. Replay/equivocation parser와 bounded state format은 그대로 유지됩니다.

Exact current-head Windows/macOS/Linux hosted tests가 terminal GREEN이 되기 전에는 source와 이 문서만으로 platform parity 완료를 주장하지 않습니다. #1220은 exact-head stable Windows evidence가 확인된 뒤에만 resolved 처리합니다.

이 state owner를 production updater flow에 연결하는 순서도 바뀌지 않습니다. Remote metadata authenticity → updater artifact cryptographic signature verification → exact sealed-descriptor digest/authenticated-size binding → explicit verified-artifact promotion → anti-replay decision → highest-seen durable mutation 순입니다. Packaged multi-process contention, process-kill, restart, power-loss, disk-full과 last-known-good rollback은 별도 release acceptance가 필요합니다.

## Security Notes

State log와 sibling lease/snapshot path에는 release identity만 저장하며 project/audio path, credential, PII, private key를 넣지 않습니다. Lease contention은 성공으로 우회하지 않습니다. Sibling snapshot은 `create_new`를 사용하고 pre-existing symlink/non-regular scratch path를 fail closed합니다. Windows fix는 stable Rust 표준 library 범위에서 동작하며 unsafe owner code, shell execution, nightly feature, 새 dependency를 추가하지 않습니다.

Hosted CI는 기존 gate를 제거하지 않고 standalone Distribution tests를 final `ci / build-and-test` prerequisite로 유지합니다.

## 참고문헌

Rust Project. (2026). *std::fs: Filesystem manipulation operations*. Rust 1.98.1 standard library documentation. https://doc.rust-lang.org/std/fs/

Rust Project. (2026). *rename in std::fs*. Rust 1.98.1 standard library documentation. https://doc.rust-lang.org/std/fs/fn.rename.html

Rust Project. (2026). *MetadataExt in std::os::unix::fs*. Rust 1.98.1 standard library documentation. https://doc.rust-lang.org/std/os/unix/fs/trait.MetadataExt.html

Rust Project. (2026). *MetadataExt in std::os::windows::fs*. Rust 1.98.1 standard library documentation. https://doc.rust-lang.org/std/os/windows/fs/trait.MetadataExt.html

Rust Project. (2026). *TryLockError in std::fs*. Rust 1.98.1 standard library documentation. https://doc.rust-lang.org/std/fs/enum.TryLockError.html
