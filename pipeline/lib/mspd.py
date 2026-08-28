"""Monthly Statement of the Public Debt: the composition of marketable debt.

Until #56 the instrument split between bills, notes and bonds was a set of
hand-typed constants in curated/snapshots.yaml, attributed to the Peter G
Peterson Foundation, a compiler of Treasury's own release, standing in for the
release. The MSPD is machine-readable at exactly the granularity the site needs,
so there was never a document to be curated from:

    v1/debt/mspd/mspd_table_1, security_type_desc = "Marketable", returns one
    row per security_class_desc: Bills, Notes, Bonds, Treasury
    Inflation-Protected Securities, Floating Rate Notes, Federal Financing Bank.

Two rules this module exists to enforce, the same two `lib/tic.py` states:

1. The release month is PINNED by curated YAML and RESOLVED to its month-end
   record_date by a bounded query, never taken as "whatever is newest". MSPD
   publishes monthly and a builder that adopted the latest release would turn
   every upstream publication into an unreviewed editorial change to a published
   figure.
2. Nothing is skipped silently. A pinned month that is absent, a query that
   returned more than one record_date, a missing instrument, an unparseable
   amount, or a class set that does not carry TIPS all raise SourceUnavailable.
   An empty parse is a failure, never "no rows".

`marketable_total_t` is the sum over EVERY marketable class, not over the three
the chart draws. That distinction is the whole reason this module exists: the
figure the site published as the marketable total, $28.0T, was bills plus notes
plus bonds wearing the total's label, and the $2.8T of TIPS and floating-rate
notes it silently omitted is precisely what makes the three families a
non-exhaustive partition. Filtering to INSTRUMENTS before totalling would
reproduce the defect exactly.

Deliberately narrow: it returns three instruments, the marketable total and the
class set the total was computed over. `avg_maturity_months` comes from the
Joint Economic Committee's monthly debt update, is a different release with a
different as-of date, and no code path here can reach it.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from .errors import SourceUnavailable
from .fetch import fetch

SOURCE = "Treasury Monthly Statement of the Public Debt"
API = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/"
ENDPOINT = "v1/debt/mspd/mspd_table_1"

# The three instrument families the maturity chart draws.
INSTRUMENTS = ("Bills", "Notes", "Bonds")

# Classes whose presence proves the query was not silently narrowed. TIPS and
# floating-rate notes are the whole of the gap between the three instruments and
# the marketable total, so a response missing them would make the composition
# look exhaustive and would let the "not an exhaustive partition" guard pass for
# the wrong reason.
REQUIRED_CLASSES = INSTRUMENTS + ("Treasury Inflation-Protected Securities", "Floating Rate Notes")

# Copied from monthly/treasury.py's `_paged`, which calls the same API through
# the same helper, rather than guessed. A `min_bytes` invented from a plan has
# broken a fetcher here before.
MIN_BYTES = 200

VINTAGE_RE = re.compile(r"^\d{4}-(?:0[1-9]|1[0-2])$")


@dataclass(frozen=True)
class MspdRelease:
    """One month-end statement's marketable composition."""

    vintage: str  # "2026-05"
    record_date: str  # "2026-05-31"
    instruments: dict[str, float]  # "Bills" | "Notes" | "Bonds" -> $ trillions
    marketable_total_t: float  # summed over EVERY marketable class
    classes: tuple[str, ...]  # every class seen, sorted, for the guard
    retrieved_at: str


def _month_bounds(vintage: str) -> tuple[str, str]:
    """`"2026-05"` -> `("2026-05-01", "2026-06-01")`.

    A half-open window, so the query is bounded by the pin rather than sorted
    and picked from. `record_date:lt:` the first of the next month admits the
    month-end statement whatever day of the month it falls on, and admits no
    other month at all.
    """
    year, month = (int(p) for p in vintage.split("-"))
    nxt = (year + 1, 1) if month == 12 else (year, month + 1)
    return f"{vintage}-01", f"{nxt[0]:04d}-{nxt[1]:02d}-01"


def request_url(vintage: str) -> str:
    """The bounded query for one pinned month. Split out so the URL recorded in
    SOURCES.md and the URL actually fetched cannot drift apart."""
    start, end = _month_bounds(vintage)
    return (
        f"{API}{ENDPOINT}"
        "?fields=record_date,security_type_desc,security_class_desc,total_mil_amt"
        f"&filter=security_type_desc:eq:Marketable,"
        f"record_date:gte:{start},record_date:lt:{end}"
        "&page[size]=100"
    )


def read_release(payload: object, vintage: str, *, retrieved_at: str, url: str) -> MspdRelease:
    """Parse an already-fetched MSPD Table 1 response into one release.

    Split from `marketable_composition` so the parser is exercised by unit tests
    without a network call or a builder, the shape `lib/tic.py` and
    `lib/xlsx.py` establish.
    """
    if not VINTAGE_RE.match(vintage):
        raise ValueError(f"mspd: vintage must be YYYY-MM, got {vintage!r}")

    if not isinstance(payload, dict) or "data" not in payload:
        raise SourceUnavailable(SOURCE, url, "unexpected payload shape; no 'data' key")
    rows = payload["data"]
    if not isinstance(rows, list) or not rows:
        raise SourceUnavailable(
            SOURCE, url,
            f"no marketable rows for {vintage}. The release month is pinned in "
            f"curated/snapshots.yaml (debt_maturity.mspd_vintage) and moving it is an "
            f"editorial act, so this is not auto-corrected to whatever is newest",
        )

    dates = sorted({str(r.get("record_date", "")) for r in rows})
    if len(dates) != 1 or not dates[0]:
        raise SourceUnavailable(
            SOURCE, url,
            f"{vintage} resolved to {len(dates)} record_date(s) ({', '.join(dates) or 'none'}); "
            f"a month must resolve to exactly one month-end statement, never a range to "
            f"scan and pick from",
        )
    record_date = dates[0]

    amounts: dict[str, float] = {}
    for row in rows:
        klass = str(row.get("security_class_desc", "")).strip()
        raw = row.get("total_mil_amt")
        if not klass:
            raise SourceUnavailable(
                SOURCE, url, f"a {record_date} row carries no security_class_desc",
            )
        try:
            amounts[klass] = float(str(raw).replace(",", "")) / 1e6
        except (TypeError, ValueError) as exc:
            raise SourceUnavailable(
                SOURCE, url,
                f"{klass!r} reads {raw!r} for {record_date}, which is not a number; an "
                f"unparseable cell is not a zero",
            ) from exc

    missing = [k for k in REQUIRED_CLASSES if k not in amounts]
    if missing:
        raise SourceUnavailable(
            SOURCE, url,
            f"the {record_date} statement is missing {', '.join(missing)}. A class set "
            f"narrower than the published one would make bills, notes and bonds look like "
            f"an exhaustive partition of the marketable total, which is the defect #56 "
            f"exists to remove",
        )

    return MspdRelease(
        vintage=vintage,
        record_date=record_date,
        instruments={k: amounts[k] for k in INSTRUMENTS},
        # Over EVERY class, including the two the chart does not draw. See the
        # module docstring: narrowing this sum is the original defect.
        marketable_total_t=sum(amounts.values()),
        classes=tuple(sorted(amounts)),
        retrieved_at=retrieved_at,
    )


def marketable_composition(vintage: str, *, use_cache: bool = True) -> MspdRelease:
    """Fetch MSPD Table 1 for the pinned month, or raise.

    Goes through `lib.fetch.fetch`, the one HTTP core (#40), the same entry
    point `lib/tic.py` uses. No second client, no retry loop, no fallback to a
    curated constant. `fetch_json` is the same core plus a `json.loads`, and it
    returns the parsed body WITHOUT the Response; this output has to record the
    retrieval time in `_meta.provenance`, and fetching twice to recover it would
    make one published figure two requests. So the parse is done here, with
    `fetch_json`'s own failure message, rather than a fourth request helper
    being added to carry it.
    """
    url = request_url(vintage)
    resp = fetch(url, source=SOURCE, min_bytes=MIN_BYTES, use_cache=use_cache)
    try:
        payload = json.loads(resp.text)
    except json.JSONDecodeError as exc:
        raise SourceUnavailable(SOURCE, url, f"body is not JSON: {exc}") from exc
    return read_release(payload, vintage, retrieved_at=resp.retrieved_at, url=resp.url)
