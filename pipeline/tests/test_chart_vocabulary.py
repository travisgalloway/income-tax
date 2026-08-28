"""The shared chart vocabulary, pinned where it is easy to drift back. Issue #35.

Two regressions this suite exists to catch, both of which last happened by a
section quietly growing a private copy of something shared:

1. `DebtChart.tsx` re-implementing its own unit toggle and its own number
   formatters. It did exactly that from Government section 1's first PR until
   #35, which is why the check names that one file rather than asserting a
   site-wide rule, `NetInterest`, `RevenueChart`, `StateGiveGet`, `PayrollBill`
   and `LawExplorer` all import Radix `ToggleGroup` directly and legitimately,
   for toggles whose options are not units.

2. Section 1's spelled-out magnitudes turning back into a bare `T` suffix, or
   its nominal axis floor turning into `$0B`. Both are screen-reader-facing
   decisions recorded in `docs/contracts/interfaces/charts.md`, and both are
   invisible in a diff of the component once the shared formatter is in place,
   the only place they show up is the built HTML.

Standard library only: `re`, `pathlib`. No new dependency, matching
`test_accessibility.py`.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
DEBT_CHART = ROOT / "src" / "components" / "islands" / "DebtChart.tsx"
GOVERNMENT_PAGE = ROOT / "dist" / "government" / "index.html"


def section(html: str, section_id: str, next_section_id: str) -> str:
    """The markup of one `<section>`, sliced by the id of the one that follows.

    The build emits each page as a handful of very long lines, so a line-based
    range would swallow the whole document.
    """
    start = html.index(f'<section id="{section_id}"')
    end = html.index(f'<section id="{next_section_id}"')
    assert end > start, f"{next_section_id} does not follow {section_id}"
    return html[start:end]


def test_debt_chart_uses_the_shared_unit_toggle() -> None:
    src = DEBT_CHART.read_text(encoding="utf-8")

    assert "@radix-ui/react-toggle-group" not in src, (
        "DebtChart.tsx imports Radix ToggleGroup directly again. Section 1's "
        "toggle is a unit toggle, so it belongs to UnitToggle — see #35."
    )
    assert re.search(r"^import \{ UnitToggle \} from '\./UnitToggle'$", src, re.M), (
        "DebtChart.tsx no longer imports the shared UnitToggle."
    )
    assert re.search(r"from '\.\./charts/format'", src), (
        "DebtChart.tsx no longer imports the shared formatters."
    )
    # The private vocabulary #35 deleted, in the shapes it had.
    for gone in ("const VIEWS", "type View "):
        assert gone not in src, f"DebtChart.tsx has grown back a private {gone!r}."


def test_section_1_spells_out_its_trillions() -> None:
    if not GOVERNMENT_PAGE.exists():
        pytest.fail(
            f"{GOVERNMENT_PAGE} not built. Run `npm run build` first — "
            "a skip here would report green on a tree that was never built."
        )
    sec = section(GOVERNMENT_PAGE.read_text(encoding="utf-8"), "forty-trillion", "who-holds-it")

    # The two annotated marker years, the ten-year doubling the section leads
    # with, and the word, not the letter.
    assert "$19.57 trillion" in sec
    assert "$40.05 trillion" in sec
    assert "$19.570T" not in sec and "$40.049T" not in sec, (
        "Section 1's read-aloud values have moved to value()'s abbreviated form. "
        "trillionsLong exists because 'T' is announced as a bare letter."
    )


def test_no_dollar_axis_labels_a_zero_tick_in_billions() -> None:
    if not GOVERNMENT_PAGE.exists():
        pytest.fail(
            f"{GOVERNMENT_PAGE} not built. Run `npm run build` first — "
            "a skip here would report green on a tree that was never built."
        )

    # Site-wide, not section 1 only: `tick()` is shared, `niceExtent` anchors
    # every non-negative series at exactly 0, and "$0B" reads as a quantity of
    # billions where there is no magnitude at all.
    for page in sorted((ROOT / "dist").glob("**/index.html")):
        assert "$0B" not in page.read_text(encoding="utf-8"), (
            f"{page.relative_to(ROOT)} renders a zero tick as '$0B'. "
            "tick(0, unit) must give '$0'."
        )
