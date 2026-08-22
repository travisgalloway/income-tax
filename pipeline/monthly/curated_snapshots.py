"""Outputs that cannot honestly be auto-fetched.

IRS SOI and OECD Revenue Statistics publish as documents, not APIs, and the debt
holder and maturity figures are assembled from several Treasury releases plus the
resolutions in curated/discrepancies.yaml. Pretending to scrape them would buy a
false sense of freshness; instead they are curated and the pipeline surfaces how
old each one is.
"""

from __future__ import annotations

from lib import curated, emit

GEN = "monthly/curated_snapshots.py"
OUTPUTS = ["debt_holders", "debt_maturity", "income_tax_by_group", "oecd"]


def build(dry_run: bool = False) -> list[str]:
    snapshots = curated._load("snapshots")["snapshots"]
    resolutions = curated.discrepancies()

    for name in OUTPUTS:
        data = snapshots[name]
        extra = {
            "refresh": {
                "mode": "curated",
                "reason": "source publishes as a document, not a machine-readable feed",
            }
        }
        if name == "debt_holders":
            # Make the deliberate omission legible to anything reading this file.
            extra["deliberate_omissions"] = {
                "federal_reserve_holdings": resolutions["federal_reserve_holdings"]["rule"]
            }
        emit.write(
            name,
            emit.build_meta(name, generator=GEN, extra=extra),
            data,
            dry_run=dry_run,
        )
    return OUTPUTS
