"""Outputs that cannot honestly be auto-fetched.

IRS SOI, OECD Revenue Statistics and the CBO distribution tables publish as
documents, not APIs. Pretending to scrape them would buy a false sense of
freshness; instead they are curated and the pipeline surfaces how old each one
is.

Two outputs have left this set, and both left because the claim in the reason
string turned out to be false rather than because the sources changed.
`debt_holders` went first (#54): its foreign holdings are fetched from Treasury
International Capital. `debt_maturity` followed (#56): the reason it carried
said the Monthly Statement of the Public Debt "publishes as a document, not a
machine-readable feed", and `mspd_table_1` returns the instrument composition
through the same fiscaldata API `monthly/treasury.py` already reads. Both are
now built by their own module and carry `refresh.mode: "mixed"`.

"Cannot honestly be auto-fetched" is a conclusion to verify against the source,
never an assumption to inherit.
"""

from __future__ import annotations

from lib import curated, emit

GEN = "monthly/curated_snapshots.py"
OUTPUTS = ["income_tax_by_group", "oecd", "cbo_effective_rates"]


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
