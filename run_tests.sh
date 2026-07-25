#!/bin/bash
cd services/analysis-engine
uv run pytest tests/test_segmenter.py
