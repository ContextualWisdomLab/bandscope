use crate::{MAX_SCORE_PDF_BYTES, PDF_MAGIC};
use std::{fs::File, io::Read, path::Path};

const SCORE_READ_ERROR: &str = "Could not read the score PDF.";
const SCORE_TOO_LARGE_ERROR: &str = "Score PDF is too large (exceeds 25MB limit).";
const SCORE_INVALID_PDF_ERROR: &str = "Stored score is not a valid PDF.";

/// Read one already-authorized stored score without allocating beyond the PDF limit.
///
/// The caller remains responsible for path authority and containment. This helper
/// opens that resolved path once, snapshots the descriptor length, allocates only
/// that bounded size, reads exactly that many bytes, and then probes one additional
/// byte on the same descriptor. A file that was already oversized is rejected
/// before heap allocation; a file that grows after metadata inspection is rejected
/// by the one-byte probe without extending the heap buffer beyond the product cap.
/// Errors intentionally omit the local path and file content.
pub fn read_validated_score_pdf(path: &Path) -> Result<Vec<u8>, String> {
    let mut file = File::open(path).map_err(|_| SCORE_READ_ERROR.to_string())?;
    let metadata = file
        .metadata()
        .map_err(|_| SCORE_READ_ERROR.to_string())?;
    if !metadata.is_file() {
        return Err(SCORE_READ_ERROR.to_string());
    }
    if metadata.len() > MAX_SCORE_PDF_BYTES {
        return Err(SCORE_TOO_LARGE_ERROR.to_string());
    }

    let expected_len = usize::try_from(metadata.len())
        .map_err(|_| SCORE_TOO_LARGE_ERROR.to_string())?;
    let mut bytes = vec![0_u8; expected_len];
    file.read_exact(&mut bytes)
        .map_err(|_| SCORE_READ_ERROR.to_string())?;

    let mut growth_probe = [0_u8; 1];
    if file
        .read(&mut growth_probe)
        .map_err(|_| SCORE_READ_ERROR.to_string())?
        != 0
    {
        return Err(SCORE_TOO_LARGE_ERROR.to_string());
    }

    if !bytes.starts_with(PDF_MAGIC) {
        return Err(SCORE_INVALID_PDF_ERROR.to_string());
    }

    Ok(bytes)
}
