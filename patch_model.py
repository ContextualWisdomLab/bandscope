with open("services/analysis-engine/src/bandscope_analysis/roles/model.py", "r") as f:
    content = f.read()

content = content.replace("    kind: str  # CueAnchorKind", "    kind: CueAnchorKind")
content = content.replace("    roleType: str  # RoleType", "    roleType: RoleType")
content = content.replace("    rehearsalPriority: str  # RehearsalPriority", "    rehearsalPriority: RehearsalPriority")

with open("services/analysis-engine/src/bandscope_analysis/roles/model.py", "w") as f:
    f.write(content)
