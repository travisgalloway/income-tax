"""Prose drift report.

sections.md quotes figures in body copy. The pipeline recomputes them and reports
any that have moved, because a source revision does not edit the prose. Drift is
reported for editorial review, never auto-corrected: BRIEF.md says not to adjust
a number without re-checking it, and that judgement is a person's to make.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from . import curated
from .validate import DATA_DIR


def _doc(name: str) -> dict[str, Any]:
    return json.loads((DATA_DIR / f"{name}.json").read_text())


def _rows(name: str) -> dict[int, dict[str, Any]]:
    return {r["y"]: r for r in _doc(name)["data"] if isinstance(r, dict) and "y" in r}


def _dig(doc: dict[str, Any], path: str) -> Any:
    cur: Any = doc
    for part in path.split("."):
        cur = cur[int(part)] if isinstance(cur, list) else cur[part]
    return cur


def _field(row: dict[str, Any], field: str) -> Any:
    # Derived fields the prose uses but the data stores separately. `g_ma` is
    # GROSS mandatory; sections.md quotes mandatory NET of offsetting receipts.
    if field == "g_ma_net":
        return row["g_ma"] + row["g_or"]
    if field == "r_ma_net":
        return row["r_ma"] + row["r_or"]
    return row.get(field)


def _resolve(fig: dict[str, Any]) -> float | None:
    out = fig["output"]
    if "path" in fig:
        return _dig(_doc(out), fig["path"])

    if "year" in fig:
        return _field(_rows(out)[fig["year"]], fig["field"])

    agg, field = fig["agg"], fig.get("field")

    if agg in ("count_cross_party", "cost_cross_party", "cost_party_line"):
        splits = {r["public_law"]: r["character"] for r in _doc("party_splits")["data"]}
        laws = [l for r in _doc("budget")["data"] for l in r["L"]]
        if agg == "count_cross_party":
            return sum(1 for l in laws if splits[l["public_law"]] == "cross-party")
        want = "cross-party" if agg == "cost_cross_party" else "party-line"
        return sum(l["score_t"] or 0 for l in laws if splits[l["public_law"]] == want)

    a, b = fig["years"]
    rows = _rows(out)
    span = [rows[y] for y in range(a, b + 1) if y in rows]
    vals = [v for v in (_field(r, field) for r in span) if v is not None]

    match agg:
        case "sum":
            return sum(vals)
        case "sum_negated":
            return -sum(vals)
        case "mean":
            return sum(vals) / len(vals)
        case "count_positive":
            return sum(1 for v in vals if v > 0)
        case "min_year":
            return min((r for r in span if _field(r, field) is not None),
                       key=lambda r: _field(r, field))["y"]
        case "pct_growth":
            return 100 * (_field(rows[b], field) / _field(rows[a], field) - 1)
        case "real_growth_disc":
            return 100 * (rows[b]["r_di"] / rows[a]["r_di"] - 1)
    raise ValueError(f"unknown agg {agg!r}")


def build_report(path: Path) -> tuple[int, int]:
    figures = curated._load("prose_figures")["figures"]
    drifted: list[str] = []
    errors: list[str] = []
    ok = 0

    for fig in figures:
        try:
            got = _resolve(fig)
        except Exception as exc:  # a figure we can no longer locate is drift too
            errors.append(f"- **s{fig['section']}** {fig['text']}: could not resolve ({exc})")
            continue
        if got is None:
            errors.append(f"- **s{fig['section']}** {fig['text']}: resolved to null")
            continue
        delta = abs(got - fig["quoted"])
        if delta > fig["tol"]:
            drifted.append(
                f"| {fig['section']} | {fig['text']} | `{fig['quoted']}` | `{got:,.4g}` | {delta:,.4g} |"
            )
        else:
            ok += 1

    lines = ["# Data report", ""]
    meta = _doc("budget")["_meta"].get("provenance", {})
    lines += [
        f"Generated {meta.get('generated_at', 'unknown')} from git `{meta.get('git_sha', '?')}`.",
        f"CBO vintage `{meta.get('vintage', '?')}`.",
        "",
        f"**{ok} of {len(figures)} prose figures still reconcile.**",
        "",
    ]

    if drifted:
        lines += [
            "## Prose drift",
            "",
            "These figures are quoted in `content/sections.md` and no longer match the data. "
            "Re-check each against the source before editing the copy; do not adjust a number "
            "without re-checking it.",
            "",
            "| § | Figure | In prose | Now | Delta |",
            "|---|---|---|---|---|",
            *drifted,
            "",
        ]
    else:
        lines += ["## Prose drift", "", "None. Every quoted figure reconciles.", ""]

    if errors:
        lines += ["## Unresolvable", "", *errors, ""]

    path.write_text("\n".join(lines) + "\n")
    return len(drifted), len(errors)
