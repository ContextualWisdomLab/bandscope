from pathlib import Path
import os

print(Path("~/audio.wav").expanduser().resolve())
print(Path("~/audio.wav").resolve())
