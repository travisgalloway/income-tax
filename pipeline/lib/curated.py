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


def top_rates() -> dict[int, float]:
    """The PUBLISHED top statutory marginal rate, 1913-2025."""
    return _load("top_rates")["top_marginal_rate"]


def top_rates_soi_anchor() -> dict[int, float]:
    """IRS SOI Historical Table 23's highest-bracket rate, 1913-2018 (#55).

    Frozen primary-source evidence, not a feed. `top_rates()` is checked
    against it year by year by validate.check_top_rates_anchor, so that
    "anchored on IRS SOI Table 23" is an observation the build makes rather
    than a sentence in a comment. Table 23 stops at 2018; 2019-2025 are
    anchored on PL 115-97 and Rev. Proc. 2018-57 through 2024-40.
    """
    return _load("top_rates_soi_anchor")["top_marginal_rate"]


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
