"""Output writing, with the provenance every chart is obliged to render.

BRIEF.md rule 1: every chart renders its source, naming the agency, the dataset
and the vintage, and does NOT summarise it to "CBO data". That is only possible
if the source string survives the pipeline intact, so `_meta.source` is copied
verbatim from curated/notes.yaml and never generated.
"""

from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path
from typing import Any

from . import curated

OUT_DIR = Path(__file__).resolve().parent.parent.parent / "src" / "data"


def git_sha() -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=10, check=True,
        )
        return out.stdout.strip()
    except (subprocess.SubprocessError, OSError):
        # Unknown is unknown. Do not pretend this is a clean tree.
        return "unknown"


def expand_title(output: str, title: str, coverage: dict[str, Any] | None) -> str:
    """Fill a curated title's `{...}` placeholders from the emitted coverage.

    A year range written by hand into curated/notes.yaml is a claim nothing
    re-checks when the underlying series is extended, and it went wrong exactly
    that way: budget's title said FY1995-FY2025 for the length of the build
    while coverage said 1962 (#41). Titles that carry no placeholder pass
    through untouched, so `source` and the thirteen other outputs are
    unaffected. A placeholder with nothing to fill it from RAISES rather than
    writing a literal `{start}` into a published file -- unknown is unknown,
    the same posture write() takes on a missing _meta.source.
    """
    if "{" not in title:
        return title
    if not coverage:
        raise ValueError(
            f"{output}: _meta.title carries a placeholder but no coverage was "
            f"passed to build_meta to fill it from"
        )
    try:
        return title.format_map(coverage)
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError(
            f"{output}: _meta.title placeholder has no matching key in _meta.coverage: {exc!r}"
        ) from exc


def build_meta(
    output: str,
    *,
    generator: str,
    vintage: str | None = None,
    retrieved_at: str | None = None,
    coverage: dict[str, Any] | None = None,
    estimate_boundary: Any = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    m = dict(curated.meta_for(output))  # title, source, units, fields, notes
    m["provenance"] = {
        "generator": generator,
        "git_sha": git_sha(),
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        **({"vintage": vintage} if vintage else {}),
        **({"retrieved_at": retrieved_at} if retrieved_at else {}),
    }
    if coverage:
        m["coverage"] = coverage
    if m.get("title"):
        m["title"] = expand_title(output, m["title"], m.get("coverage"))
    if estimate_boundary is not None:
        # Charts must not draw actuals and projections as one continuous line.
        m["estimate_boundary"] = estimate_boundary
    if extra:
        m.update(extra)
    return m


def write(output: str, meta: dict[str, Any], data: Any, *, dry_run: bool = False) -> Path:
    if "source" not in meta or not meta["source"]:
        raise ValueError(f"{output}: refusing to write an output with no _meta.source")
    path = OUT_DIR / f"{output}.json"
    payload = json.dumps({"_meta": meta, "data": data}, indent=1, ensure_ascii=False)
    if dry_run:
        return path
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(payload + "\n")
    tmp.replace(path)
    return path
