import os

file_path = "services/analysis-engine/src/bandscope_analysis/temporal/hits.py"
with open(file_path, "r") as f:
    content = f.read()

# Make sure we don't accidentally revert anything, the current error seems to stem from numpy internal errors on specific inputs with onset_detect
