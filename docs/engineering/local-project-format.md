# Local Project Format

This document specifies the format and lifecycle of a BandScope `.bscope` project file, focusing on data persistence, manual overrides, and recovery.

## Overview

BandScope projects are saved as `.bscope` files. These files are standard JSON containing the serialized `RehearsalSong` data structure. They allow users to persist the results of audio analysis and their manual corrections (overrides) across sessions.

## Schema

The primary data structure for a `.bscope` file is the `RehearsalSong` type from `@bandscope/shared-types`.

### Top-Level Structure

```json
{
  "id": "string",
  "title": "string",
  "sections": [ ... ],
  "exportSummary": {
    "format": "cue-sheet",
    "headline": "string",
    "focusSections": ["string"]
  }
}
```

### Sections and Roles

Sections describe structural segments of the song (e.g., Intro, Verse, Chorus). Each section contains a list of roles (instruments or vocals).

```json
{
  "id": "section-id",
  "label": "verse",
  "groove": "string",
  "confidence": {
    "level": "high|medium|low",
    "source": "model|user",
    "notes": "string"
  },
  "roles": [ ... ]
}
```

### Manual Overrides

To ensure provenance preservation, BandScope records when a user manually changes an analyzed property. This is stored in the `manualOverrides` array on the `RehearsalRole` object.

```json
{
  "id": "role-id",
  "name": "Bass Guitar",
  "harmony": {
    "chord": "C#m7",
    "functionLabel": "vi pedal anchor",
    "source": "user"
  },
  "manualOverrides": [
    {
      "field": "harmony",
      "value": {
        "chord": "C#m7",
        "functionLabel": "vi pedal anchor",
        "source": "user"
      },
      "source": "user"
    }
  ],
  ...
}
```

By retaining `manualOverrides`, BandScope can distinguish between original model outputs and user corrections, meeting the provenance requirements for the product.

## Security Constraints

When loading `.bscope` files from disk, BandScope applies the following constraints:
1. **Size Limits**: The project file must not exceed an upper bound (currently enforced at 5MB in Tauri backend) to prevent memory exhaustion.
2. **Schema Validation**: The loaded JSON is structurally validated against the `RehearsalSong` contract.
3. **Bounded Processing**: The JSON parsing is standard and safe, avoiding arbitrary code execution or payload expansion attacks.

## Extensibility

Future updates to the `.bscope` format should be backward-compatible where possible, adding new fields to the `RehearsalSong` contract rather than breaking existing fields. If structural changes are required, a format version field may be introduced.