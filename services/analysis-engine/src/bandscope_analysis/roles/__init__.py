"""Role extraction and part graph models."""

from .coordinated_extractor import CoordinatedRoleExtractor
from .model import (
    CueAnchorKind,
    PartGraphNode,
    RehearsalPriority,
    RehearsalRole,
    RoleExtractionResult,
    RoleType,
    SectionRoleTopology,
)
from .tuning import get_setup_note

# Preserve the established package-level import while routing the analysis
# pipeline through the cross-role temporal coordination boundary.
RoleExtractor = CoordinatedRoleExtractor

__all__ = [
    "RoleExtractor",
    "CoordinatedRoleExtractor",
    "CueAnchorKind",
    "PartGraphNode",
    "RehearsalPriority",
    "RehearsalRole",
    "RoleExtractionResult",
    "RoleType",
    "SectionRoleTopology",
    "get_setup_note",
]
