//! Native desktop domain services that are independent of the Tauri command surface.
//!
//! Keeping filesystem admission logic here lets BandScope test hostile local media
//! without granting the renderer path or playback authority.

pub mod native_file_identity;
pub mod playable_stem_admission;
