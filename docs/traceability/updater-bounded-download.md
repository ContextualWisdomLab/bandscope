# Updater bounded-download traceability

BandScope의 Distribution/update 경계는 updater artifact를 신뢰하기 전에 remote response가 메모리·디스크 자원을 무제한 소비하지 못하도록 막아야 합니다. Current Tauri updater API는 `Update::download()`가 검증된 artifact를 `Vec<u8>`로 반환하므로, 그 경로 자체를 commercial hostile-response resource admission 근거로 사용할 수 없습니다.

## 문제와 제약

`latest.json`의 `bandscope.artifacts[target].sizeBytes`는 publication-time evidence입니다. Remote endpoint가 그 값을 지킨다는 보장은 없고, Tauri artifact signature verification은 download가 끝난 뒤 일어납니다. 따라서 URL namespace pinning과 declared size만으로는 oversized/chunked response, partial response, disk-full 또는 sink failure를 fail closed한다고 주장할 수 없습니다.

이 단계에서는 metadata authenticity와 updater signing authority가 아직 provision되지 않았으므로 네트워크 fetch, signature verification, anti-replay state mutation을 한 번에 구현하지 않습니다. 대신 이후 adapter가 반드시 통과해야 하는 byte-admission primitive를 Rust로 분리합니다.

## RED → causal fix

- RED `1e1f1c2e867caacbedc1975c4b475f2a07c28abd`: repository-owned native Distribution suite가 `apps/desktop/distribution-download/Cargo.toml`을 반드시 실행하도록 먼저 요구했습니다. 이 head에서는 crate가 존재하지 않아 contract가 실패합니다.
- Fix `f183c0ca2a16d0324b0c33341dfc575503568e53`: dependency-free `bandscope-distribution-download` Rust crate를 추가했습니다. `ArtifactDownloadAdmission`은 authenticated expected size와 optional HTTP `Content-Length`를 받아 streaming chunk를 caller-owned sink에 기록하기 전에 누적 byte ceiling을 검사합니다.

## 실행 계약

`ArtifactDownloadAdmission`은 다음 invariant를 가집니다.

- expected artifact size는 0보다 크고 2 GiB 이하이어야 합니다.
- HTTP `Content-Length`가 존재하면 authenticated expected size와 정확히 같아야 body admission을 시작할 수 있습니다.
- caller가 넘기는 한 chunk는 1 MiB 이하이어야 합니다.
- 누적 byte 수가 expected size를 넘기는 chunk는 sink에 쓰기 전에 거부합니다.
- sink write가 일부 진행된 뒤 실패할 가능성을 고려해 write failure 이후 attempt를 poisoned 상태로 만들고, 이후 chunk나 success receipt를 허용하지 않습니다.
- response가 expected size보다 짧게 끝나면 `finish()`은 `Incomplete`를 반환합니다.
- exact byte count를 모두 기록했을 때만 `DownloadReceipt`가 생성됩니다.

Unit tests는 exact chunked completion, missing `Content-Length`, header mismatch, overrun-before-write, oversized single chunk, truncated response, partial sink failure, zero/over-ceiling expected size를 다룹니다. Python production logic은 추가하지 않았고 repository harness는 locked Rust suite를 validation boundary로 호출합니다.

## 기각한 대안

Tauri의 기존 `download()` callback에서 누적 `chunk_length`만 세는 방식은 기각합니다. Callback은 이미 Tauri 내부 buffering 이후의 progress signal일 뿐, BandScope가 response body를 hard bound하는 write boundary가 아닙니다.

Declared `sizeBytes`와 `Content-Length`를 동일시하는 방식도 기각합니다. `Content-Length`는 transport metadata라서 없거나 거짓일 수 있으며, cumulative byte admission이 별도로 필요합니다.

전체 artifact를 먼저 `Vec<u8>`로 받은 뒤 길이를 검사하는 방식도 기각합니다. resource exhaustion이 일어난 뒤 검사하는 것이므로 commercial resource-admission 요구를 만족하지 않습니다.

## Claim boundary

현재 crate는 **network-independent streaming primitive**입니다. 실제 production updater가 아직 이 crate를 통해 HTTP body를 수신하지 않으므로 end-to-end bounded download가 완료됐다고 주장하지 않습니다. 또한 이 crate는 SHA-256, updater signature, metadata authenticity, installer trust를 검증하지 않습니다.

다음 repository-owned 단계는 production network adapter가 full-response buffering 없이 bounded chunks를 이 primitive에 전달하고, 임시 artifact sink의 disk-full/cancel/cleanup을 fail closed하게 처리하도록 연결하는 것입니다. 그 뒤 organization-approved updater key가 provision되면 verified artifact bytes의 signature와 digest/size를 authenticated release identity에 묶고, 그 시점에만 `distribution-core`와 `distribution-state`로 freshness authority를 넘깁니다.

## Security Notes

Attack surface는 updater HTTP response body, transport length metadata, temporary artifact sink와 cancellation/error paths입니다. Remote response는 canonical release namespace를 통과해도 untrusted입니다. Byte admission failure는 installer 실행이나 highest-seen state mutation으로 승격되지 않아야 하며, sink path는 Distribution-owned app storage로 제한해야 합니다. Audio/project bytes나 paths는 updater request/receipt에 포함하지 않습니다.

## References

Tauri Contributors. (2026). *Updater*. Tauri v2 documentation. https://v2.tauri.app/plugin/updater/

Tauri Contributors. (2026). *tauri-plugin-updater 2.11.0*. docs.rs. https://docs.rs/tauri-plugin-updater/latest/tauri_plugin_updater/struct.Update.html
