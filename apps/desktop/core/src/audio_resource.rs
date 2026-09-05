use std::io::{Read, Write};

/// Maximum encoded local-audio file size accepted by the desktop bootstrap boundary.
pub const MAX_LOCAL_AUDIO_FILE_BYTES: u64 = 100 * 1024 * 1024;

const LOCAL_AUDIO_READ_ERROR: &str = "Could not read the selected audio file.";
const LOCAL_AUDIO_TOO_LARGE_ERROR: &str =
    "Choose a shorter or smaller song file to start analysis.";

/// Validate a native local-audio file length before storing bootstrap metadata.
///
/// The caller must obtain this length from the native filesystem descriptor or
/// metadata boundary rather than from renderer-controlled JSON. The function
/// intentionally returns only bounded product messages and never includes a
/// local path or payload content.
pub fn validate_local_audio_file_size(file_size_bytes: u64) -> Result<u64, String> {
    if file_size_bytes == 0 {
        return Err(LOCAL_AUDIO_READ_ERROR.to_string());
    }
    if file_size_bytes > MAX_LOCAL_AUDIO_FILE_BYTES {
        return Err(LOCAL_AUDIO_TOO_LARGE_ERROR.to_string());
    }
    Ok(file_size_bytes)
}

fn copy_bounded_local_audio_with_limit<R: Read, W: Write>(
    reader: R,
    writer: &mut W,
    max_bytes: u64,
) -> Result<u64, String> {
    let mut bounded_reader = reader.take(max_bytes.saturating_add(1));
    let copied = std::io::copy(&mut bounded_reader, writer)
        .map_err(|_| LOCAL_AUDIO_READ_ERROR.to_string())?;
    if copied == 0 {
        return Err(LOCAL_AUDIO_READ_ERROR.to_string());
    }
    if copied > max_bytes {
        return Err(LOCAL_AUDIO_TOO_LARGE_ERROR.to_string());
    }
    Ok(copied)
}

/// Copy one admitted local-audio stream into a staging writer without allowing
/// source growth to exceed the encoded-byte resource ceiling.
///
/// Security Notes: callers must pass an already-open, OS-authorized source
/// descriptor and a private app-owned staging writer. The helper reads at most
/// one byte beyond the 100 MiB ceiling so growth after metadata admission is
/// detected without allocating or copying an unbounded source. The caller must
/// discard the staging artifact on error and publish it only after this method
/// returns the observed byte count successfully.
pub fn copy_bounded_local_audio<R: Read, W: Write>(reader: R, writer: &mut W) -> Result<u64, String> {
    copy_bounded_local_audio_with_limit(reader, writer, MAX_LOCAL_AUDIO_FILE_BYTES)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn bounded_copy_rejects_stream_growth_past_the_admitted_limit() {
        let input = Cursor::new(vec![1_u8, 2, 3, 4, 5]);
        let mut staged = Vec::new();

        let error = copy_bounded_local_audio_with_limit(input, &mut staged, 4)
            .expect_err("a source that grows beyond the admitted byte limit must fail closed");

        assert_eq!(error, LOCAL_AUDIO_TOO_LARGE_ERROR);
        assert_eq!(staged, vec![1_u8, 2, 3, 4, 5]);
    }

    #[test]
    fn bounded_copy_accepts_the_exact_limit_and_reports_observed_bytes() {
        let input = Cursor::new(vec![1_u8, 2, 3, 4]);
        let mut staged = Vec::new();

        let copied = copy_bounded_local_audio_with_limit(input, &mut staged, 4)
            .expect("the exact encoded-byte limit remains admissible");

        assert_eq!(copied, 4);
        assert_eq!(staged, vec![1_u8, 2, 3, 4]);
    }
}
