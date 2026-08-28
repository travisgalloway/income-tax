"""Statutory federal income tax bracket schedules, 1913-2025.

Why this is a ONESHOT and not part of the monthly refresh: the bracket schedule
for a closed tax year is immutable history. Re-fetching and re-deflating 113
years of brackets every month to recompute a constant would be waste dressed up
as freshness.

Two things this module reconciles rather than glosses over:

1. The Tax Foundation ladder's `max(rate)` per year does not always equal
   `curated/top_rates.yaml`'s published top rate. Twelve years differ, because a
   credit, surtax or part-year rate change moved the effective published figure
   away from the statute's nominal top bracket. Both numbers are kept; see
   `curated/bracket_adjustments.yaml`.
2. The Tax Foundation CSV ends in 2019. 2020-2025 are spliced in from
   `curated/brackets_modern.yaml`, hand-transcribed from each year's IRS Revenue
   Procedure, with 2019 curated too but used ONLY as a regression check against
   the fetched CSV (which stays authoritative for 2019).

Every threshold is emitted in both nominal dollars and constant 2024 dollars,
deflated by the FRED CPIAUCNS series averaged to a calendar year, the
existing monthly/fred.py `_series` helper keys on `int(r[0][:4])` and
OVERWRITES, which yields December rather than an annual mean, so this module
parses CPI itself.
"""

from __future__ import annotations

import csv
import io
from collections import defaultdict
from typing import Any

from lib import curated, emit
from lib.errors import SourceUnavailable
from lib.fetch import fetch

GEN = "oneshot/bracket_history.py"
TF_CSV = "https://raw.githubusercontent.com/TaxFoundation/data/master/income-tax-rates/income-tax-rates.csv"
CPI_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCNS"

START_YEAR, END_YEAR = 1913, 2025
BASE_YEAR = 2024
CSV_LAST_YEAR = 2019  # Tax Foundation's fetched ladder ends here.

STATUS_MAP = {
    "single": "single",
    "marriedFilingJointly": "mfj",
    "marriedFilingSeparately": "mfs",
    "headOfHousehold": "hoh",
}
STATUSES = ("single", "mfj", "mfs", "hoh")
REFERENCE_STATUS = "single"  # the only status spanning all 113 years

FIRST_YEAR = {"single": 1913, "mfj": 1949, "mfs": 1949, "hoh": 1952}

TCJA_LADDER = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37]

# The October 2025 CPI-U was never collected: the 2025 government shutdown
# lapsed BLS's field collection for that month, and BLS said it could not
# retroactively gather it, the first gap in this monthly series since 1921.
# No later run of this pipeline will ever see a 12th observation for 2025, so
# the guard below accepts 11 for that one year rather than treating a
# structurally permanent gap as a fetch failure. Every other year must still
# have all 12 or the run fails; this is a deliberate, documented exception,
# not a relaxation of the invariant.
EXPECTED_MONTHS = {2025: 11}


# ---------------------------------------------------------------------------
# 3a. Fetch and parse the historical ladder.
# ---------------------------------------------------------------------------

def _fetch_ladder() -> dict[tuple[int, str], list[dict[str, Any]]]:
    # The live file is ~195 KB (5,398 data rows); 150 KB is comfortably below that
    # while still catching a badly truncated response.
    resp = fetch(TF_CSV, source="Tax Foundation income tax rates", min_bytes=150_000)
    rows = list(csv.DictReader(io.StringIO(resp.text)))
    by: dict[tuple[int, str], list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        year = int(r["year"])
        if not (START_YEAR <= year <= CSV_LAST_YEAR):
            continue
        raw_status = r["filingStatus"].strip()
        status = STATUS_MAP.get(raw_status)
        if status is None:
            # Never drop an unrecognised status silently: it would understate
            # bracket counts and nobody would notice.
            raise SourceUnavailable(
                "Tax Foundation income tax rates", TF_CSV,
                f"unrecognised filingStatus {raw_status!r} (year {year}) after stripping",
            )
        rate = round(float(r["incomeTaxRate"]) * 100, 4)
        lo = int(r["incomeGreaterThan"])
        hi_raw = r["incomeNotGreaterThan"].strip()
        hi = int(hi_raw) if hi_raw else None  # empty means open-ended top bracket, never 0
        by[(year, status)].append({"r": rate, "lo": lo, "hi": hi})
    if not by:
        raise SourceUnavailable("Tax Foundation income tax rates", TF_CSV, "parsed zero bracket rows")
    for key, brackets in by.items():
        _drop_phantom_zero_row(key, brackets)
        brackets.sort(key=lambda b: b["lo"])
    return by


def _drop_phantom_zero_row(key: tuple[int, str], brackets: list[dict[str, Any]]) -> None:
    """The fetched CSV has exactly one corrupt row: 1985 single carries both a
    real 0%-bracket-up-to-$2,390 (the "zero bracket amount" that stood in for
    the standard deduction from 1977-1986) AND a duplicate 0% row with an
    open-ended top (lo=0, hi=None), a phantom "0% top bracket" that
    contradicts the 50% row already present. A duplicate `lo` in any other
    year/status is a NEW corruption this code has not seen and must fail loud
    rather than guess how to resolve it.
    """
    los = [b["lo"] for b in brackets]
    if len(los) == len(set(los)):
        return
    dupes = {lo for lo in los if los.count(lo) > 1}
    phantom = [b for b in brackets if b["lo"] in dupes and b["r"] == 0.0 and b["hi"] is None]
    real = [b for b in brackets if b["lo"] in dupes and not (b["r"] == 0.0 and b["hi"] is None)]
    if key != (1985, "single") or len(phantom) != 1 or len(real) != 1:
        raise SourceUnavailable(
            "Tax Foundation income tax rates", TF_CSV,
            f"{key}: duplicate 'incomeGreaterThan' values ({sorted(dupes)}) that do not match "
            "the one known corrupt row (1985 single); refusing to guess which to drop",
        )
    brackets.remove(phantom[0])


# ---------------------------------------------------------------------------
# 3b. Splice in the curated 2019 (regression) and 2020-2025 (transcribed) years.
# ---------------------------------------------------------------------------

def _modern_ladder() -> dict[tuple[int, str], list[dict[str, Any]]]:
    doc = curated._load("brackets_modern")
    rate_ladder = [round(r * 100, 4) for r in doc["rate_ladder"]]
    if rate_ladder != [round(r * 100, 4) for r in TCJA_LADDER]:
        raise SourceUnavailable(
            "curated/brackets_modern.yaml", "(local)",
            f"rate_ladder {rate_ladder} does not match the TCJA ladder {TCJA_LADDER}",
        )

    out: dict[tuple[int, str], list[dict[str, Any]]] = {}
    for year_str, entry in doc["years"].items():
        year = int(year_str)
        for status, ceilings in entry["ceilings"].items():
            if len(ceilings) != len(rate_ladder):
                raise SourceUnavailable(
                    "curated/brackets_modern.yaml", "(local)",
                    f"{year} {status}: {len(ceilings)} ceilings, expected {len(rate_ladder)}",
                )
            brackets = []
            lo = 0
            for rate, ceiling in zip(rate_ladder, ceilings):
                brackets.append({"r": rate, "lo": lo, "hi": ceiling})
                if ceiling is not None:
                    lo = ceiling + 1
            # Every curated year's ladder must actually be the TCJA ladder, and
            # the top rate must be 37%, or a transcription slip would pass silently.
            if [b["r"] for b in brackets] != rate_ladder:
                raise SourceUnavailable(
                    "curated/brackets_modern.yaml", "(local)",
                    f"{year} {status}: rate ladder does not match TCJA's fixed 7 brackets",
                )
            if brackets[-1]["r"] != 37.0:
                raise SourceUnavailable(
                    "curated/brackets_modern.yaml", "(local)",
                    f"{year} {status}: top rate is {brackets[-1]['r']}, expected 37.0",
                )
            highs = [b["hi"] for b in brackets[:-1]]
            if highs != sorted(highs):
                raise SourceUnavailable(
                    "curated/brackets_modern.yaml", "(local)",
                    f"{year} {status}: thresholds do not strictly increase",
                )
            if brackets[-1]["hi"] is not None:
                raise SourceUnavailable(
                    "curated/brackets_modern.yaml", "(local)",
                    f"{year} {status}: top bracket has a ceiling, must be open-ended (null)",
                )
            out[(year, status)] = brackets
    return out


def _check_2019_overlap(fetched: dict, modern: dict) -> None:
    """2019 is curated as a REGRESSION YEAR ONLY. It must reproduce the fetched
    CSV exactly, or the transcription that anchors 2020-2025 is unverified."""
    checked = 0
    for status in STATUSES:
        key = (2019, status)
        if key not in fetched or key not in modern:
            continue
        checked += 1
        f_ladder = [(b["r"], b["lo"], b["hi"]) for b in fetched[key]]
        m_ladder = [(b["r"], b["lo"], b["hi"]) for b in modern[key]]
        if f_ladder != m_ladder:
            raise SourceUnavailable(
                "curated/brackets_modern.yaml", "(local)",
                f"2019 {status}: curated transcription {m_ladder} does not match the "
                f"fetched CSV {f_ladder}",
            )
    if checked == 0:
        # Zero overlap would mean the 2020-2025 transcription is never checked
        # against a live source at all.
        raise SourceUnavailable(
            "curated/brackets_modern.yaml", "(local)",
            "no filing status overlaps between the fetched CSV and the curated modern "
            "years; the 2020-2025 transcription would be unverified",
        )

    # Non-decreasing year over year, 2019 -> 2025, per status: TCJA brackets are
    # inflation-indexed and none fell.
    for status in STATUSES:
        years = sorted(y for (y, s) in modern if s == status)
        for a, b in zip(years, years[1:]):
            for ba, bb in zip(modern[(a, status)], modern[(b, status)]):
                if ba["hi"] is not None and bb["hi"] is not None and bb["hi"] < ba["hi"]:
                    raise SourceUnavailable(
                        "curated/brackets_modern.yaml", "(local)",
                        f"{status}: threshold fell from {a} (${ba['hi']}) to {b} (${bb['hi']})",
                    )


# ---------------------------------------------------------------------------
# 3c. Deflate: FRED CPIAUCNS, calendar-year means, rebased to 2024 = 100.
# ---------------------------------------------------------------------------

def _cpi_index() -> dict[int, float]:
    resp = fetch(CPI_URL, source="FRED CPIAUCNS (CPI-U, all items, monthly, NSA)", min_bytes=10_000)
    rows = list(csv.reader(io.StringIO(resp.text)))
    if len(rows) < 2:
        raise SourceUnavailable("FRED CPIAUCNS", CPI_URL, "no observations")

    by_year: dict[int, list[float]] = defaultdict(list)
    for r in rows[1:]:
        if len(r) < 2:
            continue
        try:
            year = int(r[0][:4])
            v = float(r[1])
        except ValueError:
            continue  # FRED writes "." (or leaves the cell blank) for missing months
        by_year[year].append(v)

    means: dict[int, float] = {}
    for year in range(START_YEAR, END_YEAR + 1):
        months = by_year.get(year, [])
        want = EXPECTED_MONTHS.get(year, 12)
        if len(months) != want:
            raise SourceUnavailable(
                "FRED CPIAUCNS", CPI_URL,
                f"{year}: {len(months)} monthly observations, expected exactly {want}; "
                "refusing to average a year that is not what was expected rather than "
                "silently producing a partial-year mean",
            )
        means[year] = sum(months) / len(months)

    if BASE_YEAR not in means:
        raise SourceUnavailable("FRED CPIAUCNS", CPI_URL, f"base year {BASE_YEAR} not covered")
    base = means[BASE_YEAR]
    return {y: (v / base) * 100 for y, v in means.items()}


def _deflate(ladder: dict[tuple[int, str], list[dict[str, Any]]], index: dict[int, float]) -> None:
    """Adds rlo/rhi (constant BASE_YEAR dollars) to every bracket, in place."""
    for (year, _status), brackets in ladder.items():
        factor = 100.0 / index[year]
        for b in brackets:
            b["rlo"] = round(b["lo"] * factor, 2)
            b["rhi"] = round(b["hi"] * factor, 2) if b["hi"] is not None else None


# ---------------------------------------------------------------------------
# 3d. Reconcile against curated/top_rates.yaml.
# ---------------------------------------------------------------------------

def _reconcile(sched_top: dict[int, float], published_top: dict[int, float]) -> dict[int, dict[str, Any] | None]:
    adjustments = curated._load("bracket_adjustments")["adjustments"]
    want_years = {int(y) for y in adjustments}
    out: dict[int, dict[str, Any] | None] = {}
    diverges: set[int] = set()

    for year in range(START_YEAR, END_YEAR + 1):
        s, p = sched_top[year], published_top[year]
        if abs(s - p) > 0.001:
            diverges.add(year)
            entry = adjustments.get(year)
            if entry is None:
                raise SourceUnavailable(
                    "curated/bracket_adjustments.yaml", "(local)",
                    f"{year}: schedule top {s} != published top {p}, but no adjustment is "
                    "documented for this year",
                )
            if abs(entry["schedule_top"] - s) > 0.001 or abs(entry["published_top"] - p) > 0.001:
                raise SourceUnavailable(
                    "curated/bracket_adjustments.yaml", "(local)",
                    f"{year}: adjustment entry {entry['schedule_top']}/{entry['published_top']} "
                    f"does not match the computed {s}/{p}",
                )
            out[year] = {
                "schedule": entry["schedule_top"], "published": entry["published_top"],
                "why": entry["why"].strip(), "source": entry["source"].strip(),
            }
        else:
            out[year] = None

    stale = want_years - diverges
    if stale:
        raise SourceUnavailable(
            "curated/bracket_adjustments.yaml", "(local)",
            f"{sorted(stale)}: carries an adjustment entry for a year where schedule and "
            "published top rates already agree; the file may not carry a stale exception",
        )
    return out


TRAPS = [
    "Statutory is not effective. Nobody pays the top rate on their whole income, and the "
    "income threshold it applies at has moved enormously.",
    "Ordinary income only. Capital gains have been taxed at separate, usually lower, rates "
    "for most of this period.",
    "Surtaxes are INCLUDED in the published top rate for 1940 (a defense-preparedness "
    "surtax) and for 1968-1970 (the Vietnam-era income tax surtax). Every other year "
    "EXCLUDES surtaxes; see the adjustments list for exactly which years and by how much.",
    "Excludes the alternative minimum tax, the phase-out of exemptions and deductions, and "
    "the 3.8% net investment income tax that has applied to high earners since 2013.",
    "1981 shows 69.125%, the blended rate after a part-year cut when the Economic Recovery "
    "Tax Act of 1981 dropped the top rate from 70% to 50% partway through the year.",
]


def build(dry_run: bool = False) -> list[str]:
    fetched = _fetch_ladder()
    modern = _modern_ladder()
    _check_2019_overlap(fetched, modern)

    # 2019 comes from the fetched CSV (authoritative); 2020-2025 come from the
    # curated transcription, which has no other source.
    ladder: dict[tuple[int, str], list[dict[str, Any]]] = dict(fetched)
    for key, brackets in modern.items():
        year, _status = key
        if year != CSV_LAST_YEAR:
            ladder[key] = brackets

    index = _cpi_index()
    _deflate(ladder, index)

    published_top = {int(y): v for y, v in curated._load("top_rates")["top_marginal_rate"].items()}
    sched_top = {
        year: max(b["r"] for b in ladder[(year, REFERENCE_STATUS)])
        for year in range(START_YEAR, END_YEAR + 1)
    }
    adjustments = _reconcile(sched_top, published_top)

    rows: list[dict[str, Any]] = []
    for year in range(START_YEAR, END_YEAR + 1):
        single_brackets = ladder[(year, REFERENCE_STATUS)]
        s_field: dict[str, Any] = {}
        for status in STATUSES:
            key = (year, status)
            s_field[status] = ladder[key] if key in ladder and year >= FIRST_YEAR[status] else None
        rows.append({
            "y": year,
            "top": published_top[year],
            "sched_top": round(sched_top[year], 4),
            "adj": adjustments[year],
            "nb": len(single_brackets),
            "s": s_field,
        })

    nb_values = {r["y"]: r["nb"] for r in rows}
    min_year = min(nb_values, key=lambda y: nb_values[y])
    max_year = max(nb_values, key=lambda y: nb_values[y])
    if (nb_values[min_year], nb_values[max_year]) != (2, 56):
        raise SourceUnavailable(
            "Tax Foundation income tax rates", TF_CSV,
            f"bracket-count extremes are {nb_values[min_year]} ({min_year}) to "
            f"{nb_values[max_year]} ({max_year}); expected 2 (1988) to 56 (1918)",
        )

    meta = emit.build_meta(
        "bracket_history", generator=GEN,
        coverage={
            "start": START_YEAR, "end": END_YEAR,
            "filing_status": {s: {"start": FIRST_YEAR[s], "end": END_YEAR} for s in STATUSES},
        },
        extra={
            "deflator": {
                "series_id": "CPIAUCNS", "basis": "CPI-U, all items, not seasonally adjusted, "
                "calendar-year mean of 12 monthly observations", "base_year": BASE_YEAR,
                "note": "October 2025 was never collected (2025 government shutdown; BLS said "
                        "it could not retroactively gather it), so 2025 is the calendar-year "
                        "mean of the 11 months that exist.",
            },
            "adjustments": {
                str(y): {
                    "schedule_top": a["schedule"], "published_top": a["published"],
                    "why": a["why"], "source": a["source"],
                }
                for y, a in adjustments.items() if a is not None
            },
            "bracket_count": {
                "min": nb_values[min_year], "min_year": min_year,
                "max": nb_values[max_year], "max_year": max_year,
            },
            "threshold_convention": (
                "Pre-modern rows (pre-2020) set a bracket's floor equal to the previous "
                "bracket's ceiling, as published; modern rows (2020 onward, and the fetched "
                "2019 regression year) set the floor one dollar higher. Emitted as published "
                "in each source, not normalised across the boundary."
            ),
            "traps": TRAPS,
        },
    )
    emit.write("bracket_history", meta, rows, dry_run=dry_run)
    return ["bracket_history"]
