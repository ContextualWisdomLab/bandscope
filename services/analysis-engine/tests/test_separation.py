"""Tests for the source separation module."""

from bandscope_analysis.separation.model import StemCategory
from bandscope_analysis.separation.separator import StemSeparator, _categorize_role


def test_stem_category_enum() -> None:
    """Verify StemCategory enum values match the domain requirements."""
    assert StemCategory.VOCALS.value == "vocals"
    assert StemCategory.BASS.value == "bass"
    assert StemCategory.DRUMS.value == "drums"
    assert StemCategory.KEYS.value == "keys"
    assert StemCategory.GUITAR.value == "guitar"
    assert StemCategory.OTHER.value == "other"


def test_categorize_role_vocal() -> None:
    """Test vocal role type is categorized correctly."""
    assert _categorize_role("lead-vocal", "Lead Vocal", "vocal") == StemCategory.VOCALS


def test_categorize_role_bass() -> None:
    """Test bass instrument role is categorized correctly."""
    assert _categorize_role("bass-guitar", "Bass Guitar", "instrument") == StemCategory.BASS


def test_categorize_role_keys() -> None:
    """Test keyboard role is categorized correctly."""
    assert _categorize_role("keys-right", "Keyboard 1 Right Hand", "hand") == StemCategory.KEYS


def test_categorize_role_piano() -> None:
    """Test piano role is categorized correctly."""
    assert _categorize_role("piano-1", "Piano", "instrument") == StemCategory.KEYS


def test_categorize_role_guitar() -> None:
    """Test guitar role is categorized correctly."""
    assert _categorize_role("guitar-1", "Electric Guitar", "instrument") == StemCategory.GUITAR


def test_categorize_role_drums() -> None:
    """Test drum role is categorized correctly."""
    assert _categorize_role("drum-kit", "Drum Kit", "instrument") == StemCategory.DRUMS


def test_categorize_role_other() -> None:
    """Test unknown role type is categorized as other."""
    assert _categorize_role("synth-pad", "Synth Pad", "instrument") == StemCategory.OTHER


def test_stem_separator_empty() -> None:
    """Test separator with empty roles list."""
    separator = StemSeparator()
    result = separator.separate([])
    assert result["stems"] == []
    assert "0 roles" in result["separation_notes"]


def test_stem_separator_basic() -> None:
    """Test separator with typical roles."""
    separator = StemSeparator()
    roles = [
        {"id": "bass-guitar", "name": "Bass Guitar", "roleType": "instrument"},
        {"id": "lead-vocal", "name": "Lead Vocal", "roleType": "vocal"},
        {"id": "keys-right", "name": "Keyboard Right Hand", "roleType": "hand"},
    ]
    result = separator.separate(roles)
    assert len(result["stems"]) == 3
    stems_by_id = {s["stem_id"]: s for s in result["stems"]}
    assert stems_by_id["stem-bass-guitar"]["category"] == "bass"
    assert stems_by_id["stem-lead-vocal"]["category"] == "vocals"
    assert stems_by_id["stem-keys-right"]["category"] == "keys"


def test_stem_separator_deduplicates() -> None:
    """Test separator deduplicates roles by id."""
    separator = StemSeparator()
    roles = [
        {"id": "bass-guitar", "name": "Bass Guitar", "roleType": "instrument"},
        {"id": "bass-guitar", "name": "Bass Guitar", "roleType": "instrument"},
    ]
    result = separator.separate(roles)
    assert len(result["stems"]) == 1


def test_stem_separator_invalid_role() -> None:
    """Test separator handles non-dict roles gracefully."""
    separator = StemSeparator()
    result = separator.separate(
        [{"id": "bass", "name": "Bass", "roleType": "instrument"}, "invalid"]
    )
    assert len(result["stems"]) == 1


def test_stem_separator_confidence() -> None:
    """Test confidence levels based on role types."""
    separator = StemSeparator()
    roles = [
        {"id": "bass-guitar", "name": "Bass Guitar", "roleType": "instrument"},
        {"id": "keys-left", "name": "Keys Left", "roleType": "hand"},
    ]
    result = separator.separate(roles)
    # instrument gets high, hand gets medium
    assert result["stems"][0]["confidence"] == "high"
    assert result["stems"][1]["confidence"] == "medium"


def test_stem_separator_missing_role_fields() -> None:
    """Test separator handles roles with missing fields."""
    separator = StemSeparator()
    roles = [{"id": "unknown-1"}]
    result = separator.separate(roles)
    assert len(result["stems"]) == 1
    assert result["stems"][0]["category"] == "other"
    # When name is missing, label falls back to role id
    assert result["stems"][0]["label"] == "unknown-1"


def test_stem_separator_keyboard_name_match() -> None:
    """Test separator categorizes keyboard by name even without keys in id."""
    separator = StemSeparator()
    roles = [{"id": "synth-1", "name": "Keyboard Part", "roleType": "instrument"}]
    result = separator.separate(roles)
    assert result["stems"][0]["category"] == "keys"
