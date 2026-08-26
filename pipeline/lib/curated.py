"""Loader for hand-maintained inputs.

Everything under pipeline/curated/ is editorial judgment that took real work to
establish. The pipeline READS it and merges it over fetched data. No script in
this repo may write to it.
"""

from __future__ import annotations

import functools
from pathlib import Path
from typing import Any

import yaml

CURATED_DIR = Path(__file__).resolve().parent.parent / "curated"


@functools.cache
def _load(name: str) -> dict[str, Any]:
    path = CURATED_DIR / f"{name}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"curated input missing: {path}")
    data = yaml.safe_load(path.read_text())
    if not isinstance(data, dict):
        raise ValueError(f"curated input {path} is not a mapping")
    return data


def laws() -> list[dict[str, Any]]:
    return _load("laws")["laws"]


def law_totals() -> dict[str, Any]:
    return _load("laws")["totals"]


def source_register() -> dict[str, Any]:
    """The cited-source -> SOURCES.md registration map (#39). Read by
    validate.check_sources; nothing writes it."""
    return _load("sources")


def discrepancies() -> dict[str, Any]:
    return _load("discrepancies")["resolutions"]


def conventions() -> dict[str, Any]:
    return _load("discrepancies")["conventions"]


def meta_for(output: str) -> dict[str, Any]:
    """Curated title/source/units/fields/notes for one output file."""
    outputs = _load("notes")["outputs"]
    if output not in outputs:
        raise KeyError(
            f"no curated metadata for output {output!r}. "
            "Every output must carry a source line; add it to curated/notes.yaml."
        )
    return outputs[output]
