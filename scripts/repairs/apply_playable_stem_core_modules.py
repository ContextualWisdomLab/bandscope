#!/usr/bin/env python3
"""Publish the reviewed playable-stem core modules through the crate root once.

The GitHub connector cannot apply a two-line unified patch to the large crate
root. This exact-marker repair therefore adds only the two reviewed module
exports, fails when the source moved, and is removed by its owning workflow
only after Rust formatting, tests, and Clippy all pass.
"""

from __future__ import annotations

from pathlib import Path


CORE_LIBRARY_PATH = Path("apps/desktop/core/src/lib.rs")
MODULE_MARKER = "use serde::{Deserialize, Deserializer, Serialize};\n"
MODULE_DECLARATIONS = (
    "pub mod analysis_process_status;\n"
    "pub mod playable_stem_contract;\n\n"
)


def main() -> None:
    """Insert both module declarations before the first crate dependency import."""
    library_source = CORE_LIBRARY_PATH.read_text(encoding="utf-8")
    if MODULE_DECLARATIONS in library_source:
        raise RuntimeError("Playable stem core modules are already published.")
    marker_count = library_source.count(MODULE_MARKER)
    if marker_count != 1:
        raise RuntimeError(
            f"Expected one core module marker, found {marker_count}."
        )
    repaired_source = library_source.replace(
        MODULE_MARKER,
        MODULE_DECLARATIONS + MODULE_MARKER,
        1,
    )
    CORE_LIBRARY_PATH.write_text(repaired_source, encoding="utf-8")


if __name__ == "__main__":
    main()
