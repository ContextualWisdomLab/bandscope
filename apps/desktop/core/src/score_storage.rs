use crate::{is_valid_score_id, MAX_SCORE_PDF_BYTES, PDF_MAGIC};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
};

const SCORE_ATTACH_ERROR: &str = "Could not attach the score PDF.";
const SCORE_TOO_LARGE_ERROR: &str = "Score PDF is too large (exceeds 25MB limit).";
const SCORE_INVALID_PDF_ERROR: &str = "The selected file is not a valid PDF.";
const COPY_BUFFER_BYTES: usize = 64 * 1024;

fn create_private_stage(path: &Path) -> Result<File, String> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // Deny pathname sharing while bytes are being written. Windows also
        // denies the later hard-link/unlink operations while this handle is
        // open, so publication deliberately starts only after the synchronized
        // stage handle is closed.
        options.share_mode(0);
    }

    options
        .open(path)
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())
}

fn copy_bounded_pdf_stream(
    reader: &mut impl Read,
    writer: &mut impl Write,
    expected_len: u64,
) -> Result<u64, String> {
    if expected_len == 0 {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }
    if expected_len > MAX_SCORE_PDF_BYTES {
        return Err(SCORE_TOO_LARGE_ERROR.to_string());
    }

    let mut buffer = [0_u8; COPY_BUFFER_BYTES];
    let mut total = 0_u64;
    let mut magic = [0_u8; PDF_MAGIC.len()];
    let mut magic_len = 0_usize;

    while total < expected_len {
        let remaining = (expected_len - total) as usize;
        let read_len = remaining.min(buffer.len());
        let count = reader
            .read(&mut buffer[..read_len])
            .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
        if count == 0 {
            return Err(SCORE_ATTACH_ERROR.to_string());
        }

        if magic_len < magic.len() {
            let take = (magic.len() - magic_len).min(count);
            magic[magic_len..magic_len + take].copy_from_slice(&buffer[..take]);
            magic_len += take;
        }

        writer
            .write_all(&buffer[..count])
            .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
        total += count as u64;
    }

    let mut growth_probe = [0_u8; 1];
    if reader
        .read(&mut growth_probe)
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())?
        != 0
    {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }

    if magic_len != magic.len() || magic != PDF_MAGIC {
        return Err(SCORE_INVALID_PDF_ERROR.to_string());
    }

    Ok(total)
}

#[cfg(unix)]
#[derive(Clone, Copy)]
struct StageIdentity {
    device: u64,
    inode: u64,
}

#[cfg(unix)]
fn stage_identity(file: &File) -> Result<StageIdentity, String> {
    use std::os::unix::fs::MetadataExt;

    let metadata = file
        .metadata()
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    Ok(StageIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    })
}

#[cfg(not(unix))]
#[derive(Clone, Copy)]
struct StageIdentity;

#[cfg(not(unix))]
fn stage_identity(_file: &File) -> Result<StageIdentity, String> {
    Ok(StageIdentity)
}

#[cfg(unix)]
fn remove_owned_stage(path: &Path, expected: StageIdentity) -> Result<(), String> {
    use std::os::unix::fs::MetadataExt;

    let current = fs::symlink_metadata(path).map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    if !current.is_file() || expected.device != current.dev() || expected.inode != current.ino() {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }
    fs::remove_file(path).map_err(|_| SCORE_ATTACH_ERROR.to_string())
}

#[cfg(not(unix))]
fn remove_owned_stage(path: &Path, _expected: StageIdentity) -> Result<(), String> {
    let current = fs::symlink_metadata(path).map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    if !current.is_file() {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }
    fs::remove_file(path).map_err(|_| SCORE_ATTACH_ERROR.to_string())
}

/// Publish one validated score PDF into the app-owned score workspace.
///
/// The source is reopened once and copied from that descriptor with a fixed
/// 25 MiB ceiling. The descriptor length is snapshotted before copy; early EOF
/// and an extra byte after the snapshot both fail closed, so truncation or
/// growth cannot silently change the accepted resource. The staging file is
/// created with `create_new`; Unix requests mode `0600` at first visibility,
/// while Windows deliberately inherits the app-owned parent ACL. Publication
/// uses a hard link so an existing `<score_id>.pdf` is never replaced.
///
/// Security Notes: errors never include the source path or PDF bytes. On Unix,
/// staging cleanup compares device/inode identity captured from the open stage
/// before unlinking so a foreign replacement is not deleted. Windows denies
/// stage pathname sharing during write and closes the synchronized handle before
/// publication; identity-bound cleanup after handle close remains a separate
/// acceptance item under #1239.
pub fn publish_score_pdf_attachment(
    source: &Path,
    scores_root: &Path,
    score_id: &str,
) -> Result<u64, String> {
    if !is_valid_score_id(score_id) {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }

    let mut source_file = File::open(source).map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    let source_metadata = source_file
        .metadata()
        .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    if !source_metadata.is_file() {
        return Err(SCORE_ATTACH_ERROR.to_string());
    }
    let expected_len = source_metadata.len();
    if expected_len > MAX_SCORE_PDF_BYTES {
        return Err(SCORE_TOO_LARGE_ERROR.to_string());
    }

    let stage = scores_root.join(format!(".score-{score_id}.stage"));
    let destination = scores_root.join(format!("{score_id}.pdf"));
    let mut stage_file = create_private_stage(&stage)?;
    let expected_stage = stage_identity(&stage_file)?;

    let copy_result = copy_bounded_pdf_stream(&mut source_file, &mut stage_file, expected_len)
        .and_then(|written| {
            let after = source_file
                .metadata()
                .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
            if after.len() != expected_len {
                return Err(SCORE_ATTACH_ERROR.to_string());
            }
            stage_file
                .sync_all()
                .map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
            Ok(written)
        });

    let written = match copy_result {
        Ok(written) => written,
        Err(error) => {
            drop(stage_file);
            let _ = remove_owned_stage(&stage, expected_stage);
            return Err(error);
        }
    };

    // Windows cannot create a hard link to, or unlink, a path whose handle was
    // opened with share_mode(0). Closing only after sync preserves exclusive
    // write ownership while making the completed stage publishable.
    drop(stage_file);

    if fs::hard_link(&stage, &destination).is_err() {
        let _ = remove_owned_stage(&stage, expected_stage);
        return Err(SCORE_ATTACH_ERROR.to_string());
    }

    let destination_metadata = fs::metadata(&destination).map_err(|_| SCORE_ATTACH_ERROR.to_string())?;
    if !destination_metadata.is_file() || destination_metadata.len() != written {
        // Do not unlink `destination` here: after publication a pathname swap
        // could make it foreign. Preserve unexpected evidence and fail closed.
        let _ = remove_owned_stage(&stage, expected_stage);
        return Err(SCORE_ATTACH_ERROR.to_string());
    }

    remove_owned_stage(&stage, expected_stage)?;
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn bounded_stream_rejects_growth_after_length_snapshot() {
        let mut reader = Cursor::new(b"%PDF-extra".to_vec());
        let mut output = Vec::new();

        let error = copy_bounded_pdf_stream(&mut reader, &mut output, PDF_MAGIC.len() as u64)
            .expect_err("growth after the descriptor snapshot must fail closed");

        assert_eq!(error, SCORE_ATTACH_ERROR);
    }

    #[test]
    fn bounded_stream_rejects_truncation_after_length_snapshot() {
        let mut reader = Cursor::new(PDF_MAGIC.to_vec());
        let mut output = Vec::new();

        let error = copy_bounded_pdf_stream(
            &mut reader,
            &mut output,
            (PDF_MAGIC.len() + 1) as u64,
        )
        .expect_err("truncation after the descriptor snapshot must fail closed");

        assert_eq!(error, SCORE_ATTACH_ERROR);
    }

    #[test]
    fn bounded_stream_rejects_wrong_magic_without_payload_echo() {
        let bytes = b"PK\x03\x04-not-pdf";
        let mut reader = Cursor::new(bytes.to_vec());
        let mut output = Vec::new();

        let error = copy_bounded_pdf_stream(&mut reader, &mut output, bytes.len() as u64)
            .expect_err("wrong magic must fail closed");

        assert_eq!(error, SCORE_INVALID_PDF_ERROR);
        assert!(!error.contains("PK"));
    }
}
