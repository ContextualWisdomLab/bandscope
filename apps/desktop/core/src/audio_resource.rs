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
