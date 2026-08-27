#!/usr/bin/env python3
"""Pipeline orchestrator: fetch -> normalize -> validate -> emit.

Nothing reaches src/data/ unless every validation check passes. Builders write
into a staging directory; only a clean run is promoted. That ordering is the
whole point: a monthly job that half-writes a revised dataset is worse than one
that fails.

Usage:
    uv run python build.py --tier monthly
    uv run python build.py --tier monthly --dry-run
    uv run python build.py --tier oneshot --only party_splits
"""

from __future__ import annotations

import argparse
import importlib
import shutil
import sys
import tempfile
from pathlib import Path

from lib import emit, report, validate
from lib.errors import PipelineError, ValidationFailed

ROOT = Path(__file__).resolve().parent
FINAL_DIR = ROOT.parent / "src" / "data"

# Builders that exist and must run. A module named here but missing from disk is
# a HARD FAILURE, not a skip.
TIERS: dict[str, list[str]] = {
    "monthly": ["cbo", "treasury", "debt_holders", "fred", "curated_snapshots", "states"],
    "oneshot": ["party_splits", "bracket_history"],
}

# Builders that are designed but not yet written. Naming them here rather than in
# TIERS is the whole point: a planned builder must never let a tier report
# success while silently producing nothing. `--only` on one of these exits
# non-zero and names the issue that covers it.
PLANNED: dict[str, dict[str, str]] = {
    "monthly": {},
    "oneshot": {},
}


def _builders(tier: str, only: str | None) -> list[str]:
    names = TIERS[tier]
    planned = PLANNED.get(tier, {})
    if only:
        if only in planned:
            sys.exit(
                f"--only {only!r}: not implemented yet, {planned[only]}. "
                "Refusing to report success for a builder that does not exist."
            )
        if only not in names:
            available = ", ".join(names)
            pending = ", ".join(planned) or "none"
            sys.exit(
                f"--only {only!r} is not in tier {tier!r}.\n"
                f"  implemented: {available}\n"
                f"  planned:     {pending}"
            )
        return [only]
    return names


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tier", choices=sorted(TIERS), required=True)
    ap.add_argument("--only", help="run a single builder from the tier")
    ap.add_argument("--dry-run", action="store_true", help="fetch and validate, write nothing")
    ap.add_argument("--no-cache", action="store_true", help="ignore the on-disk fetch cache")
    args = ap.parse_args()

    if args.no_cache:
        import lib.fetch as f
        _orig = f.fetch
        f.fetch = lambda url, **kw: _orig(url, **{**kw, "use_cache": False})  # type: ignore[assignment]

    staging = Path(tempfile.mkdtemp(prefix="income-tax-build-"))
    # Start from what is already published so a partial tier still validates
    # against the full set rather than against a half-empty directory.
    if FINAL_DIR.exists():
        shutil.copytree(FINAL_DIR, staging, dirs_exist_ok=True)

    emit.OUT_DIR = staging
    validate.DATA_DIR = staging

    produced: list[str] = []
    try:
        for name in _builders(args.tier, args.only):
            module_path = f"{args.tier}.{name}"
            # A builder listed in TIERS is expected to exist. Swallowing the
            # import error here would let the tier exit 0 having produced
            # nothing, which is the failure mode this pipeline exists to avoid.
            mod = importlib.import_module(module_path)
            print(f"  -> {module_path}")
            produced.extend(mod.build(dry_run=False))

        if not produced:
            sys.exit("no builders produced output; refusing to report success")

        pending = PLANNED.get(args.tier, {})
        if pending and not args.only:
            for name, why in pending.items():
                print(f"  .. not built: {name} ({why})")

        checked = sorted({p.stem for p in staging.glob("*.json")})
        checks = validate.run(checked)
        if checks.failures:
            raise ValidationFailed(checks.failures)
        print(f"  validation: {checks.passed} checks passed across {len(checked)} outputs")

        drifted, errors = report.build_report(ROOT.parent / "data-report.md")
        if drifted or errors:
            print(f"  prose drift: {drifted} figure(s) moved, {errors} unresolvable "
                  f"-> see data-report.md")
        else:
            print("  prose drift: none, all quoted figures reconcile")

        if args.dry_run:
            print(f"  dry run: {len(produced)} output(s) built and validated, nothing written")
            return 0

        FINAL_DIR.mkdir(parents=True, exist_ok=True)
        for name in produced:
            shutil.copy2(staging / f"{name}.json", FINAL_DIR / f"{name}.json")
        print(f"  wrote {len(produced)} output(s) to {FINAL_DIR}")
        return 0

    except PipelineError as exc:
        print(f"\nBUILD FAILED\n{exc}", file=sys.stderr)
        print("\nNothing was written.", file=sys.stderr)
        return 1
    finally:
        shutil.rmtree(staging, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
