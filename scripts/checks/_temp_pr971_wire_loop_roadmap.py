#!/usr/bin/env python3
"""Apply the bounded PR #971 player-selection projection repair.

The Active Player remains the single selection authority. This transition
helper only projects its admitted source index through Workspace to the sibling
SectionRoadmap, then is removed by its one-shot workflow after executable
verification succeeds.
"""

from __future__ import annotations

from pathlib import Path


PLAYER_PATH = Path("apps/desktop/src/features/workspace/RehearsalPlayer.tsx")
WORKSPACE_PATH = Path("apps/desktop/src/features/workspace/Workspace.tsx")


def replace_once(source: str, old: str, new: str, label: str) -> str:
    """Replace exactly one expected source fragment and fail closed on drift."""
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label} drifted: expected one match, found {count}")
    return source.replace(old, new, 1)


def repair_player(source: str) -> str:
    """Expose the selected admitted section index without duplicating transport state."""
    source = replace_once(
        source,
        "  onSongUpdate?: (song: RehearsalSong) => void;\n  hasLocalAudio?: boolean;",
        "  onSongUpdate?: (song: RehearsalSong) => void;\n  onSelectedSectionIndexChange?: (sectionIndex: number | null) => void;\n  hasLocalAudio?: boolean;",
        "player props",
    )
    source = replace_once(
        source,
        "  song,\n  onSongUpdate,\n  hasLocalAudio = false,",
        "  song,\n  onSongUpdate,\n  onSelectedSectionIndexChange,\n  hasLocalAudio = false,",
        "player destructuring",
    )
    source = replace_once(
        source,
        "  const selectedLoop =\n    playableLoops.find((loop) => loopSelectionKey(loop) === selectedLoopKey) ??\n    playableLoops[0] ??\n    null;\n  const selectedBoundaryKey = selectedLoop ? loopSelectionKey(selectedLoop) : null;",
        "  const selectedLoop =\n    playableLoops.find((loop) => loopSelectionKey(loop) === selectedLoopKey) ??\n    playableLoops[0] ??\n    null;\n  useEffect(() => {\n    onSelectedSectionIndexChange?.(selectedLoop?.sourceIndex ?? null);\n  }, [onSelectedSectionIndexChange, selectedLoop?.sourceIndex]);\n  const selectedBoundaryKey = selectedLoop ? loopSelectionKey(selectedLoop) : null;",
        "selected-loop projection",
    )
    return source


def repair_workspace(source: str) -> str:
    """Forward the player-owned selected source index to the roadmap projection."""
    source = replace_once(
        source,
        "  const [activeRole, setActiveRole] = useState<string | null>(null);\n  const [loopStartNonce, setLoopStartNonce] = useState(0);",
        "  const [activeRole, setActiveRole] = useState<string | null>(null);\n  const [loopStartNonce, setLoopStartNonce] = useState(0);\n  const [loopedSectionIndex, setLoopedSectionIndex] = useState<number | null>(null);",
        "workspace projection state",
    )
    source = replace_once(
        source,
        "            song={song}\n            onSongUpdate={onSongUpdate}\n            hasLocalAudio={hasLocalAudio}",
        "            song={song}\n            onSongUpdate={onSongUpdate}\n            onSelectedSectionIndexChange={setLoopedSectionIndex}\n            hasLocalAudio={hasLocalAudio}",
        "player callback wiring",
    )
    source = replace_once(
        source,
        "          <SectionRoadmap\n            song={song}\n            activeRole={resolvedActiveRole}\n            onSongUpdate={onSongUpdate}\n          />",
        "          <SectionRoadmap\n            song={song}\n            activeRole={resolvedActiveRole}\n            loopedSectionIndex={loopedSectionIndex}\n            onSongUpdate={onSongUpdate}\n          />",
        "roadmap projection wiring",
    )
    return source


def main() -> None:
    """Patch only the two production files owning the missing sibling projection."""
    player = PLAYER_PATH.read_text(encoding="utf-8")
    workspace = WORKSPACE_PATH.read_text(encoding="utf-8")
    PLAYER_PATH.write_text(repair_player(player), encoding="utf-8")
    WORKSPACE_PATH.write_text(repair_workspace(workspace), encoding="utf-8")


if __name__ == "__main__":
    main()
