"""Who holds the federal debt: fetched foreign holdings over a curated core.

This output used to sit in `curated_snapshots.py`, where every field was a
hand-typed constant and the country figures traced back to a news report of a
Treasury release rather than to the release (#54). The foreign holdings are now
read from Treasury International Capital's Major Foreign Holders table; the
public/intragovernmental split, the foreign share history and the total come
from Debt to the Penny and stay curated, because they are assembled from a
different release with a different as-of date.

That mixture is stated rather than papered over. `_meta.refresh.mode` is
`"mixed"`, not `"curated"`, and `data` carries TWO dates, `as_of` for Debt to
the Penny and `tic_as_of` for the TIC release month. Presenting one date for
both is exactly the failure the issue's edge cases name, so the front end
renders both (`mixedVintage` in src/data/index.ts).

The TIC release month is PINNED in curated/snapshots.yaml and never inferred
from what is newest: TIC revises monthly, and December 2025 would move Japan and
the UK past the prose tolerance on every re-run. Moving the pin is an editorial
act, and `check_snapshots` fails the build if the emitted vintage and the pin
disagree.
"""

from __future__ import annotations

from lib import curated, emit, tic
from lib.errors import CuratedMismatch

GEN = "monthly/debt_holders.py"
OUTPUTS = ["debt_holders"]

# The countries this site publishes, in the order the prose names them. The
# order is depended on: curated/prose_figures.yaml pins Japan/UK/China to
# data.top_foreign.{0,1,2}.amount_t.
PUBLISHED = ("Japan", "United Kingdom", "China")

REFRESH_REASON = (
    "foreign holdings fetched from Treasury International Capital, Major Foreign Holders "
    "of Treasury Securities, at the release month pinned in curated/snapshots.yaml; the "
    "public versus intragovernmental split, the total and the foreign share history are "
    "curated from Debt to the Penny and carry their own as_of"
)


def build(dry_run: bool = False) -> list[str]:
    snap = curated._load("snapshots")["snapshots"]["debt_holders"]
    resolutions = curated.discrepancies()

    vintage = snap.get("tic_vintage")
    if not vintage:
        raise CuratedMismatch(
            "curated/snapshots.yaml: debt_holders has no tic_vintage. The TIC release "
            "month is pinned by hand, deliberately -- refusing to pick one, which would "
            "silently adopt whatever Treasury published most recently."
        )
    if "top_foreign" in snap:
        raise CuratedMismatch(
            "curated/snapshots.yaml: debt_holders still carries top_foreign. Foreign "
            "holdings come from the TIC release now; a curated copy beside it would be a "
            "second source for a published figure with nothing reconciling the two."
        )

    release = tic.major_foreign_holders(vintage)

    data = {
        "total_debt_t": snap["total_debt_t"],
        "as_of": snap["as_of"],
        # Two dates, deliberately. See the module docstring.
        "tic_as_of": release.vintage,
        "split": snap["split"],
        "public_split": snap["public_split"],
        "top_foreign": [
            {"country": country, "amount_t": round(release.holdings[country] / 1000, 3)}
            for country in PUBLISHED
        ],
        "foreign_share_history": snap["foreign_share_history"],
    }

    extra = {
        "refresh": {"mode": "mixed", "reason": REFRESH_REASON},
        # A cross-check, never a published figure: TIC's all-country total and
        # Debt to the Penny's publicly-held balance are different dates, so
        # their quotient is not a well-defined share. check_snapshots uses it to
        # corroborate the curated 30%, within 3 percentage points.
        "tic_grand_total_b": release.grand_total_b,
        # Make the deliberate omission legible to anything reading this file.
        "deliberate_omissions": {
            "federal_reserve_holdings": resolutions["federal_reserve_holdings"]["rule"]
        },
    }

    emit.write(
        "debt_holders",
        emit.build_meta(
            "debt_holders",
            generator=GEN,
            vintage=release.vintage,
            retrieved_at=release.retrieved_at,
            extra=extra,
        ),
        data,
        dry_run=dry_run,
    )
    return OUTPUTS
