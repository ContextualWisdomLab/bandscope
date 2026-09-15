# Updater staging restart recovery traceability

BandScope의 updater staging은 신뢰 검증 전 bytes만 두는 scratch namespace입니다. 정상 cancel/error/drop 경로는 partial file을 지우지만, 프로세스 강제 종료나 전원 상실은 Rust `Drop`을 실행하지 않으므로 같은 artifact basename의 regular file이 남을 수 있습니다. 기존 `create_new`-only 동작은 그 파일을 무조건 `DestinationExists`로 처리해 다음 실행의 동일 업데이트를 영구적으로 막았습니다.

## 문제와 제약

이 경계는 stale partial을 자동으로 신뢰하거나 이어받아서는 안 됩니다. 이전 프로세스가 남긴 bytes에는 response completion, digest, updater signature, metadata authenticity 증거가 없기 때문입니다. 반대로 app-owned staging scratch에 남은 regular file을 수동 정리 전까지 영구 blocker로 두는 것도 restart/recovery 요구에 맞지 않습니다.

`distribution-download`는 single-writer staging owner라는 전제를 유지합니다. 이 crate의 staging namespace에는 검증 완료 artifact를 장기 보존하지 않습니다. 향후 verified-artifact promotion은 검증된 bytes를 별도 retained/known-good owner로 이동한 뒤에만 수행해야 하며, staging basename을 장기 보관 위치로 재사용하면 안 됩니다.

## RED → causal fix

- RED `5b0ddb585ee1eb7ddadaa66eeab267c6f55d6467`: 이전 프로세스가 `update.bin` regular file을 남긴 상황을 재현하고, 새 `StagedArtifactFile::create`가 stale bytes를 그대로 신뢰하지 않으면서 새 zero-length exclusive attempt를 만들 수 있어야 한다는 integration contract를 추가했습니다. 기존 구현은 모든 pre-existing destination을 `DestinationExists`로 거부하므로 이 contract에서 실패합니다.
- Causal fix `b7a1839d5941c52800bbeaf22921e143060d1ff6`: staging root와 portable basename 검증 뒤 exact child를 `symlink_metadata`로 검사합니다. Existing child가 regular file이면 interrupted unverified attempt로 간주해 제거한 뒤 `create_new`로 새 descriptor를 만듭니다. Symlink, directory 등 non-regular child는 제거하지 않고 `DestinationExists`로 fail closed합니다. Cleanup과 exclusive create 사이에 다른 writer가 path를 선점하면 `create_new`가 다시 `DestinationExists`로 실패합니다.
- Unix coverage는 destination symlink가 stale regular artifact로 오인되어 제거되지 않고, symlink target bytes도 변경되지 않는 것을 검증합니다.

## 실행 계약

- stale recovery 대상은 app-owned, non-symlink staging directory의 exact direct child 하나뿐입니다.
- artifact basename의 portable/path-traversal 규칙은 stale recovery 전에 동일하게 적용됩니다.
- pre-existing symlink, directory 또는 기타 non-regular entry는 자동 삭제하지 않습니다.
- pre-existing regular file의 bytes는 재사용하거나 resume하지 않습니다. 검증되지 않은 이전 attempt이므로 제거 후 byte zero에서 다시 시작합니다.
- replacement는 반드시 `create_new`입니다. Cleanup 이후 다른 writer가 path를 선점하면 overwrite하지 않고 실패합니다.
- 정상 새 attempt의 cancel/error/drop cleanup과 sealed-but-unverified cleanup 계약은 그대로 유지됩니다.
- verified artifact를 이 scratch namespace에 장기 보존하는 API는 여전히 없습니다.

## 기각한 대안

기존 regular file을 그대로 열어 이어받는 방식은 기각합니다. 어느 byte까지 authenticated response였는지, 이전 process가 어떤 metadata/signature를 사용했는지 증명할 수 없고, partial bytes를 새 response와 혼합할 수 있습니다.

`truncate(true)` 또는 overwrite-open으로 기존 path를 바로 재사용하는 방식도 기각합니다. Symlink/non-regular destination을 따라가거나 덮어쓸 수 있고 exclusive ownership 증거가 약해집니다. Exact child를 먼저 `symlink_metadata`로 분류한 뒤 regular file만 제거하고, 별도 `create_new`로 새 attempt를 시작합니다.

모든 pre-existing destination을 자동 삭제하는 방식도 기각합니다. Directory나 symlink를 stale partial과 동일 취급하면 app-owned scratch 경계를 벗어난 삭제나 예상하지 못한 filesystem object mutation으로 이어질 수 있습니다.

## Claim boundary

이 수리는 **restart 이후 stale regular staging file 때문에 동일 update가 영구 차단되는 source-level failure**를 닫습니다. Packaged Windows/macOS에서 실제 process kill, power loss, disk-full, antivirus/file-lock, filesystem crash가 모두 검증됐다는 뜻은 아닙니다. Staging root 자체의 권한/ownership hardening, OS-level pathname race 방어, production HTTP adapter, cryptographic verification, verified-artifact promotion과 last-known-good retention은 별도 release gate입니다.

## Security Notes

Staging bytes는 canonical release namespace에서 왔더라도 verification 전까지 untrusted입니다. Restart recovery는 stale bytes를 살리는 기능이 아니라 제거 후 새 admission을 시작하는 기능입니다. Symlink와 non-regular destination은 자동 정리 대상이 아니며, verified artifact는 staging scratch 밖의 별도 owner로 승격되어야 합니다. Audio/project content는 이 updater staging 경계에 들어오지 않습니다.
