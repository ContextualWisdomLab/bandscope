import time
import numpy as np
from bandscope_analysis.chords.chord_recognizer import ChordRecognizer

def benchmark():
    recognizer = ChordRecognizer()
    np.random.seed(42)
    # create some dummy audio. A long array
    sr = 22050
    duration = 300 # 5 minutes of audio to make the difference noticeable
    t = np.linspace(0, duration, sr * duration)
    y = (
        np.sin(2 * np.pi * 261.63 * t)
        + np.sin(2 * np.pi * 329.63 * t)
        + np.sin(2 * np.pi * 392.00 * t)
    ) / 3.0

    start_time = time.time()
    recognizer.recognize(y, sr=sr)
    end_time = time.time()

    print(f"Time taken: {end_time - start_time:.4f} seconds")

if __name__ == "__main__":
    benchmark()
