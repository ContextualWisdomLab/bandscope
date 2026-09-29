# Updater bounded-download traceability

BandScope의 Distribution/update 경계는 updater artifact를 신뢰하기 전에 remote response가 메모리·디스크 자원을 무제한 소비하지 못하도록 막아야 합니다. Current Tauri updater API는 `Update::download()`가 검증된 artifact를 `Vec<u8>`로 반환하므로, 그 경로 자체를 commercial hostile-response resource admission 근거로 사용할 수 없습니다.

## 문제와 제약

`latest.json`의 `bandscope.artifacts[target].sizeBytes`는 publication-time evidence입니다. Remote endpoint가 그 값을 지킨다는 보장은 없고, Tauri artifact signature verification은 download가 끝난 뒤 일어납니다. 따라서 URL namespace pinning과 declared size만으로는 oversized/chunked response, partial response, disk-full 또는 sink failure를 fail closed한다고 주장할 수 없습니다.

이 단계에서는 metadata authenticity와 updater signing authority가 아직 provision되지 않았으므로 네트워크 fetch, signature verification, anti-replay state mutation을 한 번에 구현하지 않습니다. 대신 이후 adapter가 반드시 통과해야 하는 byte-admission과 temporary staging primitive를 Rust로 분리합니다.

## RED → causal fix

- RED `1e1f1c2e867caacbedc1975c4b475f2a07c28abd`: repository-owned native Distribution suite가 `apps/desktop/distribution-download/Cargo.toml`을 반드시 실행하도록 먼저 요구했습니다. 이 head에서는 crate가 존재하지 않아 contract가 실패합니다.
- Fix `f183c0ca2a16d0324b0c33341dfc575503568e53`: dependency-free `bandscope-distribution-download` Rust crate를 추가했습니다. `ArtifactDownloadAdmission`은 authenticated expected size와 optional HTTP `Content-Length`를 받아 streaming chunk를 caller-owned sink에 기록하기 전에 누적 byte ceiling을 검사합니다.
- Staging RED `dcc04b78b7d51c5e79f39594ac4f02090930792e`: exclusive temporary file, cancellation cleanup, exact-receipt seal, partial-download cleanup, existing-path/path-traversal rejection을 integration contract로 먼저 요구했습니다.
- Staging fix `ed079fdc4b6150515a1352e892307d6b24bedf6e`: `StagedArtifactFile`과 `SealedArtifactFile`을 추가해 app-owned staging directory 안의 direct portable basename만 `create_new`로 생성하고, response bytes는 public raw-write API가 아니라 `admit_chunk`를 통해서만 descriptor로 보냅니다. Seal은 flush → `sync_all()` → descriptor metadata regular-file/size 확인 후에만 성공하며 still-open descriptor를 반환합니다. 당시 구현은 seal 전 drop/cancel/error 뒤 staging path를 best-effort 제거했습니다.
- Coverage `762024843218a86567c855ee1474a10549a3032a`: receipt-size mismatch cleanup, missing/non-directory staging root와 Unix symlink staging-root rejection까지 추가했습니다.
- Trust-promotion RED `a956bcfab7670aa7a461c8929c75cda8b79ba118`: exact-size seal만 성공하면 `SealedArtifactFile` drop 뒤에도 bytes가 남는 기존 동작을 뒤집어, digest/signature trust promotion 전 sealed artifact가 정상 retention 경로로 남아서는 안 된다는 integration contract를 먼저 만들었습니다.
- Causal fix `e76abddb0c40293901cd8672919172d47a93b5b9`: seal은 더 이상 artifact retention을 의미하지 않습니다. `SealedArtifactFile`이 descriptor cleanup 책임을 넘겨받고 당시 구현은 drop 시 descriptor를 먼저 닫은 뒤 staging path를 제거했습니다. 아직 별도의 verified-artifact promotion type은 만들지 않았으므로 unverified sealed bytes를 신뢰된 장기 보존으로 승격하는 public 경로도 없습니다.
- Descriptor-capability RED `56aa7467a43299500e79d2e26469b252ae9519c0`: sealed artifact 검증자가 path reopen 없이 byte zero부터 exact descriptor bytes를 읽을 수 있는 read-only stream contract를 먼저 추가했습니다. 당시 `SealedArtifactFile`에는 `reader()`가 없고 대신 write-enabled staging `File`을 `&File`로 직접 노출하고 있어 RED입니다.
- Compatibility cleanup `13ca9b7862f59c06f5dcc0337c846c050a3c7199`: 기존 staging lifecycle test가 raw `File` accessor에 의존하지 않도록 정리해 capability 제거를 준비했습니다.
- Causal fix `6144302ed807367742f87247b353742f213dbedb`: public `&File` accessor를 제거하고 `SealedArtifactReader`를 추가했습니다. Reader는 Unix/macOS에서 `FileExt::read_at`, Windows에서 `FileExt::seek_read`를 사용해 still-open descriptor를 path reopen 없이 positional read하며 `Read`만 구현합니다. Staging descriptor는 내부적으로 read/write로 열려 있어도 downstream verifier가 그 write capability를 회수할 public API가 없습니다.
- Post-seal growth RED `e1274bee951b2eb1bb58d3dbbb59d21289434384`: exact-size seal 이후 같은 inode가 외부 경로로 append되더라도 verifier stream이 최초 admitted byte boundary를 넘어 읽어서는 안 된다는 integration contract를 추가했습니다. 기존 reader는 descriptor EOF까지 읽기 때문에 appended tail까지 반환하므로 RED입니다.
- Causal fix `c4510966b874778a67f3c50f09acaf858fe7c70c`: `SealedArtifactReader`에 `remaining_bytes`를 두고 모든 positional read를 seal 당시 `bytes_written` 범위로 제한했습니다. Reader는 admitted range를 모두 읽은 뒤에는 descriptor가 더 길어져도 EOF를 반환하며, admitted range가 중간에 짧아지면 `UnexpectedEof`로 fail closed합니다.
- Truncation coverage `e294147e3d93757b7a6115222fb78317152ecc74`: seal 뒤 descriptor가 admitted size 아래로 줄어드는 경우 verifier read가 정상 completion으로 끝나지 않고 `UnexpectedEof`를 반환하는 회귀 테스트를 추가했습니다.
- Restart-recovery RED `5b0ddb585ee1eb7ddadaa66eeab267c6f55d6467`: process kill/power loss가 `Drop`을 건너뛰어 exact staging basename의 regular file을 남긴 상황을 재현하고, 다음 실행이 stale bytes를 신뢰하지 않으면서 새 attempt를 시작해야 한다는 integration contract를 추가했습니다. 기존 `create_new`-only 구현은 `DestinationExists`로 실패합니다.
- Restart causal fix `b7a1839d5941c52800bbeaf22921e143060d1ff6`: app-owned non-symlink staging root와 portable basename을 먼저 검증한 뒤 exact child를 `symlink_metadata`로 분류합니다. Existing regular file만 interrupted unverified attempt로 제거하고 다시 `create_new`하며, symlink/directory 등 non-regular entry는 자동 제거하지 않고 fail closed합니다.
- Concurrent-writer RED `82843b4833df264aa6d5530d9f46545b1179a0bb`: 살아 있는 첫 staging attempt가 partial bytes를 보유한 동안 두 번째 attempt가 같은 regular pathname을 crash residue로 오인해 reclaim해서는 안 된다는 계약을 추가했습니다. Restart-only 구현은 live regular child와 stale regular child를 구별할 ownership evidence가 없어 실패합니다.
- Causal fix `40cd7543fab6ac6cb203e310b16058645edcedae`: artifact pathname을 검사하거나 stale regular child를 제거하기 전에 app-owned staging directory의 persistent `.bandscope-staging.lock`을 열고 `File::try_lock()` exclusive lease를 획득합니다. 다른 cooperating BandScope handle/process가 lock을 보유하면 `ConcurrentAttempt`로 fail closed합니다. Lease는 `StagedArtifactFile`에서 `SealedArtifactFile`로 함께 이동하고 descriptor cleanup 뒤에만 해제됩니다.
- Fixture adaptation `ebf94287ea54d329a3276f02a5251054c9b2d20c`: persistent lease sentinel과 ephemeral artifact cleanup을 test teardown에서 구분했습니다.
- Edge coverage `d2d187288ef27e7fabdacde062d83423bfa2e243`: sealed-but-unverified artifact가 lease를 계속 보유하는지, cleanup 뒤 fresh attempt가 가능한지, Unix에서 lease sentinel symlink를 따라가지 않는지를 검증합니다.
- Restart/concurrency traceability `ebefa230880f3e460be012af9cbc42651814c73f`: stale recovery, active-process ownership, persistent sentinel, OS lock의 claim boundary와 기각 대안을 별도 traceability 문서에 연결했습니다.
- Windows pathname RED `308f4a618cbbfd07fc9380b721f9987b3cb373d1`: cancelled/sealed artifact가 열려 있는 동안 owned file을 다른 이름으로 이동하고 original basename에 unrelated replacement를 만든 뒤 Drop했을 때 replacement bytes가 살아 있어야 한다는 기존 Unix contract를 Windows까지 확장했습니다. 당시 non-Unix fallback은 descriptor close 후 remembered pathname을 무조건 삭제하므로 RED입니다.
- Windows causal fix `1d603316b0ff4ff8b737aea2ef57c76250e326d0`: Unix는 still-open descriptor `(dev, ino)`와 현재 direct regular pathname identity가 일치할 때만 unlink합니다. Stable Rust에서 동등한 Windows by-handle identity를 증명할 수 없는 경로는 descriptor를 닫되 remembered pathname을 삭제하지 않습니다. 다른 객체를 지울 가능성보다 unverified scratch를 임시로 남기는 쪽을 선택했습니다.
- Windows deferred-reclaim coverage `1a6ee097106cf2204cf9bdbcc0040999988f4e14`: deferred Windows scratch가 다음 staging attempt의 shared lease 아래에서 stale direct regular child로 회수되고 byte zero에서 새 attempt가 시작됨을 고정합니다.
- Path-identity traceability `0bae56fe905ed165c6973867f6c7e896c431195f`: Windows 기본 sharing, 기각 대안, storage-retention tradeoff와 residual pathname race의 claim boundary를 `updater-staging-path-identity.md`에 기록했습니다.
- Test-contract adaptation `7996cc2a1ae722093ab02c5a590ccc562a2b058b`, `2acb2f3708b6ef6fb664e7dcc2741fa219c199ed`, `4c94b4698c79fd32f659fb58106f2da0aa510d1a`, `2e4c355df5c45117c01ff1585e6478a8951ad168`, `6a85d358d46194d60a852f59463fa23252785992`: sealed-reader, staging-lifecycle, and transport integration fixtures를 OS별 cleanup contract 및 persistent lease sentinel semantics에 맞췄습니다. Windows에서 deferred scratch를 trust success로 간주하지 않고 fixture teardown 또는 다음 leased attempt가 명시적으로 회수합니다.

## 실행 계약

`ArtifactDownloadAdmission`은 다음 invariant를 가집니다.

- expected artifact size는 0보다 크고 2 GiB 이하이어야 합니다.
- HTTP `Content-Length`가 존재하면 authenticated expected size와 정확히 같아야 body admission을 시작할 수 있습니다.
- caller가 넘기는 한 chunk는 1 MiB 이하이어야 합니다.
- 누적 byte 수가 expected size를 넘기는 chunk는 sink에 쓰기 전에 거부합니다.
- sink write가 일부 진행된 뒤 실패할 가능성을 고려해 write failure 이후 attempt를 poisoned 상태로 만들고, 이후 chunk나 success receipt를 허용하지 않습니다.
- response가 expected size보다 짧게 끝나면 `finish()`은 `Incomplete`를 반환합니다.
- exact byte count를 모두 기록했을 때만 `DownloadReceipt`가 생성됩니다.

`StagedArtifactFile`은 그 receipt가 실제 temporary artifact lifecycle로 승격될 때 다음 invariant를 추가합니다.

- staging root는 이미 존재하는 non-symlink directory여야 합니다. Directory 생성이나 임의 parent traversal은 이 crate가 수행하지 않습니다.
- artifact name은 bounded ASCII portable basename이고 `/`, `\\`, percent encoding, hidden/path-like name과 Windows reserved device stem을 허용하지 않습니다.
- stale artifact classification보다 먼저 persistent staging sentinel의 exclusive OS file lease를 획득합니다. 이미 cooperating process가 lease를 보유하면 `ConcurrentAttempt`로 실패하고 existing artifact pathname을 건드리지 않습니다.
- lease sentinel은 coordination object일 뿐 content trust evidence가 아닙니다. 정상 종료 뒤에도 pathname은 남을 수 있고 active ownership은 open handle의 OS lock으로 판단합니다.
- lease sentinel이 symlink 또는 non-regular object이면 따라가거나 자동 교체하지 않고 fail closed합니다.
- lease를 획득한 뒤 같은 exact basename의 pre-existing regular file만 interrupted unverified attempt로 간주합니다. 해당 bytes는 재사용/resume하지 않고 제거한 뒤 byte zero에서 새 `create_new` attempt를 시작합니다.
- pre-existing symlink, directory 또는 기타 non-regular artifact destination은 stale regular artifact로 자동 정리하지 않습니다. Lease를 획득한 뒤 cleanup/create 사이에 path를 다른 actor가 선점해도 `create_new`가 overwrite하지 않고 `DestinationExists`로 실패합니다.
- response write는 `ArtifactDownloadAdmission`을 통과해야 하므로 staged descriptor에 caller가 raw bytes를 직접 쓰는 public API가 없습니다.
- cancel, overrun, sink failure 또는 seal failure 상태로 drop되면 descriptor ownership은 종료되지만 pathname cleanup은 OS별입니다. Unix는 현재 pathname이 still-open descriptor와 같은 direct regular object일 때만 unlink합니다. Windows는 stable code에서 그 identity를 증명할 수 없으므로 pathname 삭제를 추측하지 않고 unverified scratch를 다음 leased attempt까지 남길 수 있습니다.
- seal은 userspace flush와 descriptor `sync_all()` 이후 descriptor가 regular file인지, exact receipt size와 같은지 다시 확인합니다.
- 성공한 `SealedArtifactFile`은 descriptor와 staging lease를 함께 계속 열어 두므로 후속 digest/signature verification이 path reopen보다 exact staged bytes에 결합되고, 검증 중 다른 cooperating attempt가 pathname을 stale로 reclaim하지 못합니다.
- sealed verifier access는 `SealedArtifactReader`의 positional `Read` stream으로 제한합니다. 내부 staging `File`은 write-enabled이지만 raw `&File`을 public하게 반환하지 않으므로 verifier가 `Write for &File` 또는 platform `FileExt` write API로 sealed bytes를 바꾸는 capability를 얻지 않습니다.
- `SealedArtifactReader`는 seal 당시 admitted byte count까지만 읽습니다. Seal 뒤 같은 inode가 더 길어져도 appended bytes는 verifier input이 되지 않으며, admitted range가 짧아지면 정상 EOF가 아니라 `UnexpectedEof`로 거부합니다. 따라서 verifier input의 resource bound가 path-side file growth 때문에 다시 열리지 않습니다.
- exact-size seal은 신뢰 승격이 아닙니다. Unix에서는 identity가 일치하는 staging pathname을 Drop에서 제거합니다. Windows에서는 pathname ownership을 증명할 수 없을 때 descriptor만 닫고 unverified scratch를 남길 수 있으며, 다음 attempt가 shared lease를 획득한 뒤 stale direct regular child로만 회수합니다. 어느 경우에도 deferred bytes는 verified artifact나 freshness authority가 아닙니다.
- verified artifact promotion은 이 scratch basename을 장기 보존 위치로 재사용해서는 안 됩니다. 검증된 bytes를 별도 retained/known-good owner로 이동한 뒤에만 launch 간 보존을 허용해야 합니다.

Unit/integration tests는 exact chunked completion, missing `Content-Length`, header mismatch, overrun-before-write, oversized single chunk, truncated response, partial sink failure, zero/over-ceiling expected size, OS별 cancellation cleanup, exact seal 후 Unix unlink/Windows deferred reclamation, pathname replacement 보존, descriptor-bound read-only sealed stream, seal 후 external growth에 대한 admitted-range cap, seal 후 truncation fail-closed, failed-admission cleanup, receipt mismatch, stale regular destination restart recovery, active concurrent staging rejection, sealed lease retention/release, persistent lease sentinel teardown, path-like name, invalid staging root, Unix symlink root·lease sentinel·artifact destination 보존을 다룹니다. Python production logic은 추가하지 않았고 repository harness는 locked Rust suite를 validation boundary로 호출합니다.

## 기각한 대안

Tauri의 기존 `download()` callback에서 누적 `chunk_length`만 세는 방식은 기각합니다. Callback은 이미 Tauri 내부 buffering 이후의 progress signal일 뿐, BandScope가 response body를 hard bound하는 write boundary가 아닙니다.

Declared `sizeBytes`와 `Content-Length`를 동일시하는 방식도 기각합니다. `Content-Length`는 transport metadata라서 없거나 거짓일 수 있으며, cumulative byte admission이 별도로 필요합니다.

전체 artifact를 먼저 `Vec<u8>`로 받은 뒤 길이를 검사하는 방식도 기각합니다. Resource exhaustion이 일어난 뒤 검사하는 것이므로 commercial resource-admission 요구를 만족하지 않습니다.

Generic temporary pathname에 overwrite-open하고 나중에 검사하는 방식도 기각합니다. Existing file/symlink를 교체하거나 path-like name이 app-owned staging root를 벗어날 수 있고, cancel/error 뒤 partial artifact를 성공 candidate처럼 남길 수 있습니다.

Crash 뒤 남은 regular staging file을 그대로 resume하는 방식도 기각합니다. 이전 process의 response completion, metadata/signature context와 admitted byte boundary를 증명할 수 없으므로 stale bytes는 새 response와 혼합하지 않고 제거한 뒤 처음부터 받습니다.

모든 pre-existing destination을 자동 삭제하는 방식도 기각합니다. Symlink나 directory 같은 non-regular entry를 stale partial과 동일 취급하면 app-owned scratch 경계를 벗어난 mutation 가능성이 생깁니다. Regular child만 reclaim하고 non-regular entry는 fail closed합니다.

Artifact file 자체만 lock하는 방식도 기각합니다. Portable `create_new`와 file-lock acquisition 사이를 하나의 atomic create+lock operation으로 보장할 수 없어 새 pathname이 다른 process에 관찰되는 순간과 active ownership establishment가 분리됩니다. 별도 persistent sentinel의 lease를 먼저 획득해 stale classification 자체를 직렬화합니다.

Lease sentinel을 정상 drop마다 삭제하는 방식도 기각합니다. Locked sentinel pathname을 unlink하고 새 inode를 만들 수 있게 하면 기존 inode를 열어 기다리던 process와 새 process가 서로 다른 lock domain을 가질 수 있습니다. Sentinel pathname은 유지하고 open handle의 lock 보유 여부만 active ownership으로 사용합니다.

Exact-size seal을 곧바로 artifact retention으로 취급하는 방식도 기각합니다. Byte count와 `sync_all()`은 digest, updater signature, remote metadata authenticity를 증명하지 않습니다. Windows에서 안전한 pathname unlink를 증명할 수 없어 unverified scratch가 다음 leased attempt까지 남을 수는 있지만, 이는 trust promotion이나 known-good retention이 아니라 cleanup을 보수적으로 지연한 것입니다.

Sealed artifact에서 raw `&File`을 verifier에 넘기는 방식도 기각합니다. Rust standard library는 `Write for &File`을 구현하고 있고 staging descriptor 자체가 write access로 열린 상태이므로, immutable borrow처럼 보이는 API가 실제로는 sealed bytes를 바꿀 수 있는 write capability를 노출합니다. 별도 path reopen은 descriptor identity를 잃으므로, 동일 open descriptor에 대한 positional read-only wrapper를 사용합니다.

Descriptor EOF까지 무제한 읽는 방식도 기각합니다. Seal 당시에는 exact size였더라도 이후 같은 inode가 path-side append로 커질 수 있습니다. Verifier가 EOF까지 `read_to_end`하면 byte-admission에서 닫았던 resource bound가 다시 열리고, digest/signature input 범위도 original receipt보다 넓어집니다. Reader가 admitted byte count를 자체적으로 소유하고 그 범위를 넘지 않게 해야 합니다.

## Claim boundary

현재 crate는 **network-library-independent streaming + staging primitive**입니다. 실제 production updater가 아직 이 crate를 통해 HTTP body를 수신하지 않으므로 end-to-end bounded download가 완료됐다고 주장하지 않습니다. Source-level lease는 cooperating BandScope processes 사이에서 live attempt와 crash residue를 구분하지만 임의의 로컬 악성 process에 대한 mandatory filesystem isolation은 아닙니다. Rust file lock은 platform에 따라 advisory 또는 mandatory일 수 있고, staging root ACL/ownership hardening과 pathname TOCTOU 방어는 별도 security boundary입니다.

Stale regular child recovery와 active-writer tests는 process-kill 뒤 동일 update가 영구 차단되거나 다른 live BandScope attempt가 pathname을 reclaim하는 source 경로를 닫습니다. Unix pathname cleanup은 metadata-check 이후 unlink까지의 hostile same-user TOCTOU를 완전히 제거한다고 주장하지 않습니다. Windows는 stable Rust에서 descriptor/path identity를 확인하지 못하므로 destructive Drop cleanup을 하지 않고 stale scratch retention을 허용합니다. 이 retention은 다음 leased attempt에서 bounded regular-child recovery가 가능한 범위이며, packaged Windows/macOS power-loss durability, antivirus/file-lock, disk-full, filesystem crash 전체를 증명하지 않습니다. `sync_all()`과 cleanup tests를 packaged durability와 동일시하지 않으며 이 crate는 SHA-256, updater signature, metadata authenticity, installer trust도 검증하지 않습니다.

다음 repository-owned 단계는 production network adapter가 full-response buffering 없이 bounded chunks를 이 primitive에 전달하도록 연결하는 것입니다. 그 adapter는 canonical release origin/redirect 정책을 보존하고 implicit redirect/transparent decompression을 끄며, cancel/network error/disk-full을 staged-file cleanup 또는 명시적인 deferred-scratch recovery 상태로 귀결시켜야 합니다. 그 뒤 organization-approved updater key가 provision되면 still-open sealed descriptor의 signature와 digest/size를 authenticated release identity에 묶고, 그 검증을 통과한 bytes만 별도의 verified-artifact promotion 경계로 보존한 뒤 `distribution-core`와 `distribution-state`로 freshness authority를 넘겨야 합니다.

## Security Notes

Attack surface는 updater HTTP response body, transport length metadata, temporary artifact directory/path, staging lease, staged descriptor와 cancellation/error paths입니다. Remote response는 canonical release namespace를 통과해도 untrusted입니다. Byte/staging admission failure는 installer 실행이나 highest-seen state mutation으로 승격되지 않아야 하며, staging root는 Distribution-owned app storage로 제한해야 합니다. Restart recovery는 stale bytes를 살리는 기능이 아니라 active cooperating owner가 없음을 lease로 확인한 뒤 app-owned scratch의 exact regular child를 제거하고 새 admission을 시작하는 기능입니다. Lease sentinel과 artifact pathname의 symlink/non-regular object는 자동 정리하지 않습니다. Unix Drop은 descriptor identity가 일치하는 direct regular pathname만 제거하고, Windows Drop은 stable code에서 identity를 증명할 수 없으면 pathname 삭제를 지연합니다. Deferred Windows scratch는 여전히 unverified이며 다음 leased attempt가 stale regular child로만 회수합니다. Sealed descriptor의 raw write capability는 verifier에 노출하지 않으며, 후속 검증은 descriptor-bound read-only stream을 사용해야 합니다. 그 stream은 seal 당시 admitted byte count를 상한으로 삼아 post-seal growth를 무시하고 early truncation을 error로 처리해야 합니다. Audio/project bytes나 paths는 updater request/receipt에 포함하지 않습니다.

## References

Tauri Contributors. (2026). *Updater*. Tauri v2 documentation. https://v2.tauri.app/plugin/updater/

Tauri Contributors. (2026). *tauri-plugin-updater 2.11.0*. docs.rs. https://docs.rs/tauri-plugin-updater/latest/tauri_plugin_updater/struct.Update.html

Rust Project Developers. (2026). *File and TryLockError in std::fs* (Rust 1.98.1). https://doc.rust-lang.org/std/fs/struct.File.html#method.try_lock

Rust Project Developers. (2026). *Read in std::io* (Rust 1.98). https://doc.rust-lang.org/std/io/trait.Read.html

Rust Project Developers. (2026). *Write in std::io* (Rust 1.98). https://doc.rust-lang.org/std/io/trait.Write.html

Rust Project Developers. (2026). *FileExt in std::os::unix::fs* (Rust 1.98). https://doc.rust-lang.org/std/os/unix/fs/trait.FileExt.html

Rust Project Developers. (2026). *FileExt in std::os::windows::fs* (Rust 1.98). https://doc.rust-lang.org/std/os/windows/fs/trait.FileExt.html
