"""Counted per-party roll-call splits for the 23 major laws.

SOURCES.md names this as the fix for the dataset's weakest point: 22 of 23 laws
carried a party split CLASSIFIED from published vote character rather than
counted. This joins Voteview's roll-call data to produce real tallies.

Why this is a ONESHOT and not part of the monthly refresh: roll calls from 1995
to 2025 are immutable history. Re-fetching 190 MB every month to recompute a
constant would be waste dressed up as freshness.

The regression target is PL 115-97 (TCJA), whose split is independently verified
from the House Clerk record: House R 224-12, D 0-189; Senate R 51-0, D 0-48.
"""

from __future__ import annotations

import csv
import io
from collections import defaultdict
from typing import Any

from lib import curated, emit
from lib.errors import SourceUnavailable
from lib.fetch import fetch

GEN = "oneshot/party_splits.py"
BASE = "https://voteview.com/static/data/out/"

# Voteview party_code. Everything else is recorded as "other" rather than being
# folded into a major party, which would fabricate a split.
DEM, GOP = 100, 200

# cast_code. Only 1 (Yea) and 6 (Nay) are votes actually cast. Codes 2-3 are
# paired and announced yeas, 4-5 paired and announced nays; the official tally
# excludes all four, and counting them inflates the result.
YEA, NAY = {1}, {6}

# Voteview records the PRESIDENT as a pseudo-member (icpsr 99912, chamber
# "President") expressing a position on a bill, and the row can appear twice.
# Including it added 2 phantom Republican yeas to the TCJA House vote. The join
# therefore requires a member of the voting chamber itself.
CHAMBER_NAME = {"H": "House", "S": "Senate"}

_members: dict[int, dict[str, Any]] | None = None
_votes: dict[tuple[str, int], list[dict[str, str]]] = {}


def _load_members() -> dict[int, dict[str, Any]]:
    global _members
    if _members is None:
        url = f"{BASE}members/HSall_members.csv"
        text = fetch(url, source="Voteview members", min_bytes=1_000_000).text
        _members = {}
        for r in csv.DictReader(io.StringIO(text)):
            try:
                # Voteview writes these as float strings ("200.0"), so int() alone
                # raises and would silently skip every member.
                key = (int(r["congress"]), r["chamber"], int(float(r["icpsr"])))
                _members[key] = int(float(r["party_code"]))
            except (ValueError, KeyError, TypeError):
                continue
        if not _members:
            raise SourceUnavailable("Voteview members", url, "no parseable member rows")
    return _members


def _load_votes(chamber: str, congress: int) -> list[dict[str, str]]:
    key = (chamber, congress)
    if key not in _votes:
        # Per-congress files are 1.7-15 MB; HSall_votes.csv is 190 MB.
        url = f"{BASE}votes/{chamber}{congress}_votes.csv"
        text = fetch(url, source=f"Voteview {chamber}{congress} votes", min_bytes=100_000).text
        _votes[key] = list(csv.DictReader(io.StringIO(text)))
    return _votes[key]


def _split(chamber: str, congress: int, rollnumber: int) -> dict[str, Any]:
    members = _load_members()
    rows = [r for r in _load_votes(chamber, congress)
            if r.get("rollnumber") and int(r["rollnumber"]) == rollnumber]
    if not rows:
        raise SourceUnavailable(
            f"Voteview {chamber}{congress}", BASE,
            f"roll call {rollnumber} not found; the curated mapping may be wrong",
        )

    tally: dict[str, dict[str, int]] = defaultdict(lambda: {"yea": 0, "nay": 0, "other": 0})
    seen: set[int] = set()
    chamber_name = CHAMBER_NAME[chamber]
    for r in rows:
        try:
            icpsr, cast = int(float(r["icpsr"])), int(float(r["cast_code"]))
        except (ValueError, KeyError, TypeError):
            continue
        party = members.get((congress, chamber_name, icpsr))
        if party is None:
            continue  # not a member of this chamber (e.g. the president's position)
        if icpsr in seen:
            continue  # Voteview can repeat a row; never double-count a member
        seen.add(icpsr)
        bucket = "d" if party == DEM else "r" if party == GOP else "i"
        key = "yea" if cast in YEA else "nay" if cast in NAY else "other"
        tally[bucket][key] += 1

    out = {b: dict(tally[b]) for b in ("r", "d", "i")}
    out["yea"] = sum(out[b]["yea"] for b in ("r", "d", "i"))
    out["nay"] = sum(out[b]["nay"] for b in ("r", "d", "i"))
    # Published tallies (House Clerk, Senate roll calls, press) fold the
    # independents who caucus with the Democrats into the Democratic column, so
    # the Senate TCJA vote is reported as D 0-48 where the party breakdown is
    # D 0-46 plus I 0-2. Both are given: `d` is party membership, `d_caucus` is
    # the convention every published source uses. Charts must say which they use.
    out["d_caucus"] = {
        k: out["d"][k] + out["i"][k] for k in ("yea", "nay", "other")
    }
    out["rollnumber"] = rollnumber
    return out


def minority_yes_share(chamber: dict) -> float | None:
    """Share of the yes votes that came from the smaller of the two parties.

    Uses the caucus basis, so an independent voting with the Democrats counts
    toward the Democratic column, matching how these votes are reported.
    """
    r_y = chamber["r"]["yea"]
    d_y = chamber["d_caucus"]["yea"]
    total = r_y + d_y
    if total == 0:
        return None
    return min(r_y, d_y) / total


def _character(house: dict | None, senate: dict | None) -> str:
    """Derive vote character from COUNTED votes, replacing the classification.

    "Cross-party" means at least 10% of the yes votes in AT LEAST ONE chamber
    came from the minority party.

    Any-chamber, not every-chamber: a bill can clear the House on a near
    party-line vote and still need a substantial minority-party bloc in the
    Senate to survive a filibuster, and that bloc is real. Requiring both
    chambers classifies the 2021 infrastructure act as party-line despite 19
    Republican senators voting for it, which no reader would accept.

    The 10% floor is a judgement, stated in the output so it can be disagreed
    with rather than reverse-engineered.
    """
    shares = [s for s in (minority_yes_share(c) for c in (house, senate) if c) if s is not None]
    if not shares:
        return "no recorded vote"
    return "cross-party" if max(shares) >= 0.10 else "party-line"


def build(dry_run: bool = False) -> list[str]:
    laws = curated.laws()
    results: list[dict[str, Any]] = []

    for law in laws:
        rc = law.get("rollcall") or {}
        cong = rc.get("congress")
        if not cong:
            raise SourceUnavailable(
                "curated/laws.yaml", "(local)",
                f"{law['name']}: no roll-call mapping. Add one or the join cannot run.",
            )
        house = _split("H", cong, rc["house"]) if rc.get("house") else None
        senate = _split("S", cong, rc["senate"]) if rc.get("senate") else None

        entry = {
            "public_law": law["public_law"],
            "name": law["name"],
            "date": law["date"],
            "congress": cong,
            "house": house,
            "senate": senate,
            "character": _character(house, senate),
            "legacy_classification": law["legacy_comp"],
        }
        if rc.get("note"):
            entry["note"] = rc["note"]
        results.append(entry)

    # Regression against the one law with an independently verified split.
    # Compared on the CAUCUS basis, because that is what the published record uses.
    tcja = next(r for r in results if r["public_law"] == "115-97")
    want = {
        "house": {"r": (224, 12), "d_caucus": (0, 189)},
        "senate": {"r": (51, 0), "d_caucus": (0, 48)},
    }
    for ch, expectations in want.items():
        for bucket, exp in expectations.items():
            got = (tcja[ch][bucket]["yea"], tcja[ch][bucket]["nay"])
            if got != exp:
                raise SourceUnavailable(
                    "Voteview TCJA regression", BASE,
                    f"PL 115-97 {ch} {bucket} counted {got[0]}-{got[1]}, published record "
                    f"says {exp[0]}-{exp[1]}. The join is wrong.",
                )

    meta = emit.build_meta(
        "party_splits", generator=GEN,
        coverage={"laws": len(results), "start": min(r["date"] for r in results),
                  "end": max(r["date"] for r in results)},
        extra={
            "method": (
                "Per-party yea/nay counted from Voteview roll-call records, joined on "
                "ICPSR id to member party for the congress in question. The final-passage "
                "roll call for each law is curated by hand, not inferred by date."
            ),
            "cross_party_threshold": (
                "A vote is 'cross-party' when at least 10% of the yes votes came from the "
                "minority party in AT LEAST ONE chamber, on the caucus basis. Any-chamber "
                "rather than every-chamber, because a bill can pass the House near "
                "party-line and still need a substantial minority bloc to clear the Senate. "
                "This threshold is a judgement, stated here so it can be disagreed with."
            ),
            "regression": "PL 115-97 reproduces the published record on the caucus basis: "
                          "H R 224-12 / D 0-189, S R 51-0 / D 0-48. The Senate figure is "
                          "D 0-46 plus I 0-2 by party membership.",
            "party_vs_caucus": (
                "`r`, `d` and `i` are PARTY MEMBERSHIP. `d_caucus` adds the independents who "
                "caucus with the Democrats, which is the convention the House Clerk, the "
                "Senate roll calls and press coverage all use. A chart must state which "
                "basis it shows; the two differ by two Senate seats through most of this "
                "period."
            ),
            "missing_votes": "A null chamber means NO ROLL CALL EXISTS (a voice vote). That "
                             "is missing data, never unanimity.",
        },
    )
    emit.write("party_splits", meta, results, dry_run=dry_run)
    return ["party_splits"]
