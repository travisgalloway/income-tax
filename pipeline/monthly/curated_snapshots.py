"""Outputs that cannot honestly be auto-fetched.

IRS SOI, OECD Revenue Statistics and the CBO distribution tables publish as
documents, not APIs, and the debt maturity figures are assembled from several
Treasury releases. Pretending to scrape them would buy a false sense of
freshness; instead they are curated and the pipeline surfaces how old each one
is.

`debt_holders` used to be in this set and is not any more (#54): its foreign
holdings are fetched from Treasury International Capital, so it is built by
`monthly/debt_holders.py` and carries `refresh.mode: "mixed"`. "Cannot honestly
be auto-fetched" is a conclusion to verify against the source, never an
assumption to inherit.
"""

from __future__ import annotations

from lib import curated, emit

GEN = "monthly/curated_snapshots.py"
OUTPUTS = ["debt_maturity", "income_tax_by_group", "oecd", "cbo_effective_rates"]


def build(dry_run: bool = False) -> list[str]:
    snapshots = curated._load("snapshots")["snapshots"]

    for name in OUTPUTS:
        extra = {
            "refresh": {
                "mode": "curated",
                "reason": "source publishes as a document, not a machine-readable feed",
            }
        }
        emit.write(
            name,
            emit.build_meta(name, generator=GEN, extra=extra),
            snapshots[name],
            dry_run=dry_run,
        )
    return OUTPUTS
