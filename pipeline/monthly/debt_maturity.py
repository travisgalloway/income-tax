"""How old the debt is: fetched instrument composition over a curated core.

This output used to sit in `curated_snapshots.py`, where every figure was a
hand-typed constant carrying the reason "source publishes as a document, not a
machine-readable feed". That sentence was false (#56). The Monthly Statement of
the Public Debt publishes Table 1 through fiscaldata at exactly the granularity
this section needs, and the constants were attributed to the Peter G Peterson
Foundation, a compiler of the release, standing in for the release.

What the curated attribution cost is worth stating, because it is why the fetch
was not optional. `marketable_total_t` read $28.0T, which is bills plus notes
plus bonds ($28.11T) wearing the marketable total's label; the real May 2026
total is $30.91T. Two curated claims were built on that wrong denominator and
were therefore artefacts rather than editorial judgements: that the three
instruments "do not sum exactly" to the total (a $0.05T rounding residue, not
the $2.80T of TIPS and floating-rate notes it was reaching for), and that the
published 22% bills share "disagrees on purpose" with 6.8/28.0 = 24.3% (it does
not disagree at all, 6.76/30.91 is 21.9%).

Average maturity, the longest instrument and the maturity history stay curated:
they come from the Joint Economic Committee's monthly debt update, a different
release with a different as-of date, and no MSPD field supplies them. So the
output is honestly `refresh.mode: "mixed"` and carries TWO dates, `mspd_as_of`
for the statement month and `avg_maturity_as_of` for the JEC update. Presenting
one date for both is the failure `mixedVintage` in src/data/index.ts exists to
prevent.

The MSPD release month is PINNED in curated/snapshots.yaml and never inferred
from what is newest. MSPD publishes monthly; auto-adopting the latest statement
would turn every upstream publication into an unreviewed editorial change to a
published figure. Moving the pin is an editorial act, and `check_snapshots`
fails the build if the emitted vintage and the pin disagree.
"""

from __future__ import annotations

from lib import curated, emit, mspd
from lib.errors import CuratedMismatch

GEN = "monthly/debt_maturity.py"
OUTPUTS = ["debt_maturity"]

# The composition rows this site publishes, keyed to MSPD's class labels. A
# closed set of three: no other marketable class can reach the chart, and the
# two that cannot (TIPS, floating-rate notes) are exactly the gap the caveat
# names.
PUBLISHED = {"bills": "Bills", "notes": "Notes", "bonds": "Bonds"}

REFRESH_REASON = (
    "instrument composition and the marketable total are fetched from the Treasury "
    "Monthly Statement of the Public Debt, Table 1, at the release month pinned in "
    "curated/snapshots.yaml; average maturity, the longest instrument and the maturity "
    "history are curated from the Joint Economic Committee monthly debt update and carry "
    "their own as_of"
)


def build(dry_run: bool = False) -> list[str]:
    snap = curated._load("snapshots")["snapshots"]["debt_maturity"]

    vintage = snap.get("mspd_vintage")
    if not vintage:
        raise CuratedMismatch(
            "curated/snapshots.yaml: debt_maturity has no mspd_vintage. The statement "
            "month is pinned by hand, deliberately -- refusing to pick one, which would "
            "silently adopt whatever Treasury published most recently."
        )
    if "marketable_total_t" in snap:
        raise CuratedMismatch(
            "curated/snapshots.yaml: debt_maturity still carries marketable_total_t. It "
            "comes from the MSPD statement now; a curated copy beside it is how $28.0T "
            "(bills + notes + bonds) came to be published as the marketable total (#56)."
        )
    for row in snap["composition"]:
        if "amount_t" in row:
            raise CuratedMismatch(
                f"curated/snapshots.yaml: debt_maturity composition row {row.get('k')!r} "
                f"still carries amount_t. Instrument amounts come from MSPD now; a curated "
                f"copy beside the fetched one is a second source for a published figure "
                f"with nothing reconciling the two."
            )

    release = mspd.marketable_composition(vintage)

    data = {
        "avg_maturity_months": snap["avg_maturity_months"],
        "avg_maturity_as_of": snap["avg_maturity_as_of"],
        # Two dates, deliberately. See the module docstring.
        "mspd_as_of": release.vintage,
        "longest_instrument_years": snap["longest_instrument_years"],
        # Summed over EVERY marketable class, not over the three drawn below.
        "marketable_total_t": round(release.marketable_total_t, 3),
        # `share_pct` is carried through only where curated/snapshots.yaml
        # carries it, bills, and only bills. Filling it in for notes and bonds
        # from amount_t / marketable_total_t is exactly what the island is
        # forbidden to do, and doing it here would launder the same derivation
        # into the data.
        "composition": [
            {
                "k": row["k"],
                "label": row["label"],
                "maturity": row["maturity"],
                **({"share_pct": row["share_pct"]} if "share_pct" in row else {}),
                "amount_t": round(release.instruments[PUBLISHED[row["k"]]], 3),
            }
            for row in snap["composition"]
        ],
        "history_months": snap["history_months"],
    }

    extra = {
        "refresh": {"mode": "mixed", "reason": REFRESH_REASON},
        # The class set the marketable total was summed over, recorded so a
        # query that silently narrowed is visible rather than inferred from a
        # total that merely looks plausible. check_snapshots asserts TIPS and
        # floating-rate notes are in it.
        "mspd_classes": list(release.classes),
        "mspd_record_date": release.record_date,
    }

    emit.write(
        "debt_maturity",
        emit.build_meta(
            "debt_maturity",
            generator=GEN,
            vintage=release.vintage,
            retrieved_at=release.retrieved_at,
            extra=extra,
        ),
        data,
        dry_run=dry_run,
    )
    return OUTPUTS
