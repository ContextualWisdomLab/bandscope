//! Renderer-safe source availability resolution for the current rehearsal project.
//!
//! Native playback authority remains the only owner of filesystem paths and file
//! identity. This module only decides whether an already-minted full mix and its
//! canonical four stems may be exposed together to the renderer.

/// Generic buyer-safe error returned when native playback availability is not a
/// complete, current source set.
pub const PLAYBACK_SOURCE_AVAILABILITY_ERROR: &str =
    "Could not read the current playback source availability.";

/// Resolve one renderer-visible availability snapshot from native source probes.
///
/// The full mix must remain available. Generated stems are either all present or
/// all absent; a partial set is rejected so the renderer never invents a mixed
/// generation or displays controls for sources that are not jointly authoritative.
pub fn resolve_playback_source_availability(
    full_mix_authority: String,
    stem_authorities: [String; 4],
    mut probe: impl FnMut(&str) -> Result<bool, String>,
) -> Result<Vec<String>, String> {
    let full_mix_is_available = probe(&full_mix_authority)
        .map_err(|_| PLAYBACK_SOURCE_AVAILABILITY_ERROR.to_string())?;
    if !full_mix_is_available {
        return Err(PLAYBACK_SOURCE_AVAILABILITY_ERROR.to_string());
    }

    let mut available_stem_count = 0usize;
    for stem_authority in &stem_authorities {
        if probe(stem_authority)
            .map_err(|_| PLAYBACK_SOURCE_AVAILABILITY_ERROR.to_string())?
        {
            available_stem_count += 1;
        }
    }

    if available_stem_count == 0 {
        return Ok(vec![full_mix_authority]);
    }
    if available_stem_count != stem_authorities.len() {
        return Err(PLAYBACK_SOURCE_AVAILABILITY_ERROR.to_string());
    }

    let mut available = Vec::with_capacity(1 + stem_authorities.len());
    available.push(full_mix_authority);
    available.extend(stem_authorities);
    Ok(available)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn authorities() -> (String, [String; 4]) {
        (
            "bandscope-project://project-100-1".to_string(),
            [
                "bandscope-project://project-100-1/stem/vocals".to_string(),
                "bandscope-project://project-100-1/stem/bass".to_string(),
                "bandscope-project://project-100-1/stem/drums".to_string(),
                "bandscope-project://project-100-1/stem/other".to_string(),
            ],
        )
    }

    #[test]
    fn full_mix_only_is_a_complete_availability_snapshot() {
        let (full_mix, stems) = authorities();
        let full_mix_expected = full_mix.clone();
        let resolved = resolve_playback_source_availability(full_mix, stems, |authority| {
            Ok(authority == full_mix_expected)
        })
        .expect("full-mix-only authority should be visible");

        assert_eq!(resolved, vec![full_mix_expected]);
    }

    #[test]
    fn complete_four_stem_set_is_exposed_in_canonical_order() {
        let (full_mix, stems) = authorities();
        let expected = std::iter::once(full_mix.clone())
            .chain(stems.iter().cloned())
            .collect::<Vec<_>>();
        let resolved = resolve_playback_source_availability(full_mix, stems, |_| Ok(true))
            .expect("complete authority set should be visible");

        assert_eq!(resolved, expected);
    }

    #[test]
    fn partial_stem_availability_fails_closed() {
        let (full_mix, stems) = authorities();
        let states = BTreeMap::from([
            (full_mix.clone(), true),
            (stems[0].clone(), true),
            (stems[1].clone(), false),
            (stems[2].clone(), true),
            (stems[3].clone(), true),
        ]);
        let resolved = resolve_playback_source_availability(full_mix, stems, |authority| {
            Ok(*states.get(authority).unwrap_or(&false))
        });

        assert_eq!(
            resolved.as_deref(),
            Err(PLAYBACK_SOURCE_AVAILABILITY_ERROR)
        );
    }

    #[test]
    fn revoked_full_mix_and_probe_errors_fail_closed() {
        let (full_mix, stems) = authorities();
        let revoked = resolve_playback_source_availability(full_mix.clone(), stems.clone(), |_| {
            Ok(false)
        });
        assert_eq!(
            revoked.as_deref(),
            Err(PLAYBACK_SOURCE_AVAILABILITY_ERROR)
        );

        let probe_failure = resolve_playback_source_availability(full_mix, stems, |_| {
            Err("native probe failed".to_string())
        });
        assert_eq!(
            probe_failure.as_deref(),
            Err(PLAYBACK_SOURCE_AVAILABILITY_ERROR)
        );
    }
}
