# Updater bounded-download traceability

BandScope의 Distribution/update 경계는 updater artifact를 신뢰하기 전에 remote response가 메모리·디스크 자원을 무제한 소비하지 못하도록 막아야 합니다. Current Tauri updater API는 `Update::download()`가 검증된 artifact를 `Vec<u8>`로 반환하므로, 그 경로 자체를 commercial hostile-response resource admission 근거로 사용할 수 없습니다.

## 문제와 제약

`latest.json`의 `bandscope.artifacts[target].sizeBytes`는 publication-time evidence입니다. Remote endpoint가 그 값을 지킨다는 보장은 없고, Tauri artifact signature verification은 download가 끝난 뒤 일어납니다. 따라서 URL namespace pinning과 declared size만으로는 oversized/chunked response, partial response, disk-full 또는 sink failure를 fail closed한다고 주장할 수 없습니다.

이 단계에서는 metadata authenticity와 updater signing authority가 아직 provision되지 않았으므로 네트워크 fetch, signature verification, anti-replay state mutation을 한 번에 구현하지 않습니다. 대신 이후 adapter가 반드시 통과해야 하는 byte-admission과 temporary staging primitive를 Rust로 분리합니다.

## RED → causal fix

- RED `1e1f1c2e867caacbedc1975c4b475f2a07c28abd`: repository-owned native Distribution suite가 `apps/desktop/distribution-download/Cargo.toml`을 반드시 실행하도록 먼저 요구했습니다. 이 head에서는 crate가 존재하지 않아 contract가 실패합니다.
- Fix `f183c0ca2a16d0324b0c33341dfc575503568e53`: dependency-free `bandscope-distribution-download` Rust crate를 추가했습니다. `ArtifactDownloadAdmission`은 authenticated expected size와 optional HTTP `Content-Length`를 받아 streaming chunk를 caller-owned sink에 기록하기 전에 누적 byte ceiling을 검사합니다.
- Staging RED `dcc04b78b7d51c5e79f39594ac4f02090930792e`: exclusive temporary file, cancellation cleanup, exact-receipt seal, partial-download cleanup, existing-path/path-traversal rejection을 integration contract로 먼저 요구했습니다.
- Staging fix `ed079fdc4b6150515a1352e892307d6b24bedf6e`: `StagedArtifactFile`과 `SealedArtifactFile`을 추가해 app-owned staging directory 안의 direct portable basename만 `create_new`로 생성하고, response bytes는 public raw-write API가 아니라 `admit_chunk`를 통해서만 descriptor로 보냅니다. Seal은 flush → `sync_all()` → descriptor metadata regular-file/size 확인 후에만 성공하며 still-open descriptor를 반환합니다. Seal 전 drop/cancel/error는 열린 descriptor를 닫은 뒤 staging path를 best-effort 제거합니다.
- Coverage `762024843218a86567c855ee1474a10549a3032a`: receipt-size mismatch cleanup, missing/non-directory staging root와 Unix symlink staging-root rejection까지 추가했습니다.
- Trust-promotion RED `a956bcfab7670aa7a461c8929c75cda8b79ba118`: exact-size seal만 성공하면 `SealedArtifactFile` drop 뒤에도 bytes가 남는 기존 동작을 뒤집어, digest/signature trust promotion 전 sealed artifact는 drop 시 제거되어야 한다는 integration contract를 먼저 만들었습니다. 이 head에서는 기존 source가 sealed path를 보존하므로 새 test가 실패하는 RED입니다.
- Causal fix `e76abddb0c40293901cd8672919172d47a93b5b9`: seal은 더 이상 artifact retention을 의미하지 않습니다. `SealedArtifactFile`이 descriptor cleanup 책임을 넘겨받고, drop 시 descriptor를 먼저 닫은 뒤 staging path를 제거합니다. Windows에서 열린 파일 삭제가 실패할 수 있으므로 descriptor를 `Option<File>`로 보유해 drop 순서를 명시했습니다. 아직 별도의 verified-artifact promotion type은 만들지 않았으므로 unverified sealed bytes를 영구 보존하는 public 경로도 없습니다.

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
- destination은 `create_new`로만 만들며 기존 file/symlink를 overwrite하지 않습니다.
- response write는 `ArtifactDownloadAdmission`을 통과해야 하므로 staged descriptor에 caller가 raw bytes를 직접 쓰는 public API가 없습니다.
- cancel, overrun, sink failure 또는 seal failure 상태로 drop되면 partial staging path를 유지하지 않습니다.
- seal은 userspace flush와 descriptor `sync_all()` 이후 descriptor가 regular file인지, exact receipt size와 같은지 다시 확인합니다.
- 성공한 `SealedArtifactFile`은 descriptor를 계속 열어 두므로 후속 digest/signature verification이 path reopen보다 exact staged bytes에 결합될 수 있습니다.
- exact-size seal은 신뢰 승격이 아닙니다. `SealedArtifactFile` 자체는 cleanup-on-drop이며 descriptor를 먼저 닫은 다음 staging path를 제거합니다. 후속 digest/signature/authenticated-metadata 결합이 성공하기 전에는 unverified bytes가 정상 종료 경로에서 남지 않습니다.

Unit/integration tests는 exact chunked completion, missing `Content-Length`, header mismatch, overrun-before-write, oversized single chunk, truncated response, partial sink failure, zero/over-ceiling expected size, cancellation cleanup, exact seal 후 unverified cleanup, failed-admission cleanup, receipt mismatch, existing destination, path-like name, invalid staging root와 Unix symlink root를 다룹니다. Python production logic은 추가하지 않았고 repository harness는 locked Rust suite를 validation boundary로 호출합니다.

## 기각한 대안

Tauri의 기존 `download()` callback에서 누적 `chunk_length`만 세는 방식은 기각합니다. Callback은 이미 Tauri 내부 buffering 이후의 progress signal일 뿐, BandScope가 response body를 hard bound하는 write boundary가 아닙니다.

Declared `sizeBytes`와 `Content-Length`를 동일시하는 방식도 기각합니다. `Content-Length`는 transport metadata라서 없거나 거짓일 수 있으며, cumulative byte admission이 별도로 필요합니다.

전체 artifact를 먼저 `Vec<u8>`로 받은 뒤 길이를 검사하는 방식도 기각합니다. Resource exhaustion이 일어난 뒤 검사하는 것이므로 commercial resource-admission 요구를 만족하지 않습니다.

Generic temporary pathname에 overwrite-open하고 나중에 검사하는 방식도 기각합니다. Existing file/symlink를 교체하거나 path-like name이 app-owned staging root를 벗어날 수 있고, cancel/error 뒤 partial artifact를 성공 candidate처럼 남길 수 있습니다.

Exact-size seal을 곧바로 artifact retention으로 취급하는 방식도 기각합니다. Byte count와 `sync_all()`은 digest, updater signature, remote metadata authenticity를 증명하지 않습니다. 신뢰 검증 전 sealed bytes를 정상 drop 뒤 남기면 실패한 verifier나 cancelled promotion 뒤 untrusted artifact가 app-owned staging에 잔존할 수 있습니다.

## Claim boundary

현재 crate는 **network-library-independent streaming + staging primitive**입니다. 실제 production updater가 아직 이 crate를 통해 HTTP body를 수신하지 않으므로 end-to-end bounded download가 완료됐다고 주장하지 않습니다. 또한 `sync_all()`과 cleanup tests를 packaged Windows/macOS power-loss durability와 동일시하지 않습니다. 이 crate는 SHA-256, updater signature, metadata authenticity, installer trust도 검증하지 않습니다.

다음 repository-owned 단계는 production network adapter가 full-response buffering 없이 bounded chunks를 이 primitive에 전달하도록 연결하는 것입니다. 그 adapter는 canonical release origin/redirect 정책을 보존하고, cancel/network error/disk-full을 staged-file cleanup으로 귀결시켜야 합니다. 그 뒤 organization-approved updater key가 provision되면 still-open sealed descriptor의 signature와 digest/size를 authenticated release identity에 묶고, 그 검증을 통과한 bytes만 별도의 verified-artifact promotion 경계로 보존한 뒤 `distribution-core`와 `distribution-state`로 freshness authority를 넘겨야 합니다.

## Security Notes

Attack surface는 updater HTTP response body, transport length metadata, temporary artifact directory/path, staged descriptor와 cancellation/error paths입니다. Remote response는 canonical release namespace를 통과해도 untrusted입니다. Byte/staging admission failure는 installer 실행이나 highest-seen state mutation으로 승격되지 않아야 하며, staging root는 Distribution-owned app storage로 제한해야 합니다. Cleanup은 app-owned non-symlink directory라는 전제 안에서만 pathname removal을 수행합니다. Audio/project bytes나 paths는 updater request/receipt에 포함하지 않습니다.

## References

Tauri Contributors. (2026). *Updater*. Tauri v2 documentation. https://v2.tauri.app/plugin/updater/

Tauri Contributors. (2026). *tauri-plugin-updater 2.11.0*. docs.rs. https://docs.rs/tauri-plugin-updater/latest/tauri_plugin_updater/struct.Update.html
