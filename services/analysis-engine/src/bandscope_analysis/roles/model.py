"""Domain model for role extraction and part graphing."""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal, NotRequired, TypedDict


class RoleType(str, Enum):
    """Canonical role types."""

    INSTRUMENT = "instrument"
    VOCAL = "vocal"
    HAND = "hand"


class RehearsalPriority(str, Enum):
    """Rehearsal priority for a given role in a section."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ConfidenceMarker(TypedDict):
    """Confidence level and notes for a field or role."""

    level: Literal["low", "medium", "high"]
    source: Literal["model", "user"]
    notes: str


class RehearsalHarmony(TypedDict):
    """Harmony specifics for a role."""

    chord: str
    functionLabel: str
    source: Literal["model", "user"]


class RangeSummary(TypedDict):
    """Range summary for a role."""

    lowestNote: str
    highestNote: str


class CueAnchorKind(str, Enum):
    """Kinds of cue anchor."""

    LYRIC = "lyric"
    COUNT = "count"
    TRANSITION = "transition"


class RoleCueAnchor(TypedDict):
    """A cue anchor for a role."""

    kind: CueAnchorKind
    value: str


class ManualOverride(TypedDict):
    """A manual override applied to a role field."""

    field: str
    value: dict[str, Any]
    source: str


class RehearsalRole(TypedDict):
    """A role (instrument, vocal, or hand) active in a particular section."""

    id: str
    name: str
    roleType: RoleType
    harmony: RehearsalHarmony
    cue: RoleCueAnchor
    range: RangeSummary
    confidence: ConfidenceMarker
    rehearsalPriority: RehearsalPriority
    simplification: str
    setupNote: str
    manualOverrides: list[ManualOverride]
    overlapWarnings: list[str]
    dropPlan: NotRequired[str]
    dropPlanSource: NotRequired[Literal["model", "user"]]


class PartGraphNode(TypedDict):
    """A node representing a role in the part graph for a section."""

    role_id: str
    is_active: bool
    handoff_to: list[str]
    handoff_from: list[str]


class SectionRoleTopology(TypedDict):
    """The topology of roles within a single section."""

    section_id: str
    active_roles: list[RehearsalRole]
    part_graph: list[PartGraphNode]


class RoleExtractionResult(TypedDict):
    """Result returned by the role extraction pipeline."""

    topologies: list[SectionRoleTopology]
    extraction_notes: str
