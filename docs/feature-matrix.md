# Feature matrix

Single view of what exists per route and how far along it is. One table per route, ordered as a
reader encounters the sections. Status vocabulary is fixed: `Planned`, `In progress`, `Shipped`,
`Deprecated`. A row moves to `Shipped` only when its issue's full definition of done passes, not
when the code merges.

## Introduction route (`src/pages/index.astro`)

| ID | Capability | UI | Data | Status | Issue | Contract |
|----|-----------|----|------|--------|-------|----------|
| INTRO-1 | Front door — what the site is, and which route answers which question | placeholder | n/a | In progress | #43, #48 | — |

## Economy route (`src/pages/economy/index.astro`)

| ID | Capability | UI | Data | Status | Issue | Contract |
|----|-----------|----|------|--------|-------|----------|
| ECO-1 | One picture — real GDP FY1950-FY2036 on a log scale, actual/projection split | done | done | Shipped | #12 | contracts/interfaces/economy-data.md, contracts/interfaces/charts.md |
| ECO-2 | Growth and its shadow — output per hour vs. real median household income, indexed 1984=100 | done | done | Shipped | #12 | contracts/interfaces/economy-data.md, contracts/interfaces/charts.md |
| ECO-3 | Who works — unemployment vs. the noncyclical rate, and labour force participation | done | done | Shipped | #12 | contracts/interfaces/economy-data.md, contracts/interfaces/charts.md |
| ECO-4 | Prices and rates — CPI-U and core PCE inflation (derived YoY), fed funds, 3-month bill, 10-year note | done | done | Shipped | #13, #34 | contracts/interfaces/economy-data.md, contracts/interfaces/charts.md |
| ECO-5 | Labor and capital — wages and salaries against corporate profits, both % of GDP | done | done | Shipped | #13 | contracts/interfaces/economy-data.md, contracts/interfaces/charts.md |
| ECO-6 | Limits — what this route cannot tell you, hand-off to /households | done | done | Shipped | #13 | contracts/interfaces/economy-data.md |

## Government route (`src/pages/government/index.astro`)

| ID | Capability | UI | Data | Status | Issue | Contract |
|----|-----------|----|------|--------|-------|----------|
| GOV-1 | The $40 trillion — debt series, ten-year doubling, nominal / % of GDP toggle | done | done | Shipped | #1, #35, #36 | contracts/interfaces/budget-data.md, contracts/interfaces/charts.md |
| GOV-2 | Who holds it — public vs intragovernmental, domestic vs foreign | done | done | Shipped | #6 | contracts/interfaces/curated-snapshots.md, contracts/interfaces/charts.md |
| GOV-3 | How old is the debt — maturity ladder against the 30-year ceiling | done | done | Shipped | #6 | contracts/interfaces/curated-snapshots.md, contracts/interfaces/charts.md |
| GOV-4 | The whole budget — outlays stacked (mandatory net/discretionary/interest), revenue line, deficit below zero, party-control strip, unit toggle, year inspection, era bands | done | done | Shipped | #2 | contracts/interfaces/budget-data.md, contracts/interfaces/charts.md |
| GOV-5 | The structural gap — revenue vs outlays, nominal / real / % of GDP toggle, sign-and-position surplus band | done | done | Shipped | #5 | contracts/interfaces/budget-data.md, contracts/interfaces/charts.md |
| GOV-6 | What Congress votes on — mandatory (net) vs discretionary vs net interest, nominal / real / % of GDP toggle, FY2015 trajectory marker | done | done | Shipped | #5, #34 | contracts/interfaces/budget-data.md, contracts/interfaces/charts.md |
| GOV-7 | Net interest — nominal/real bars by fiscal year, FY2015 trough and FY2003 series low marked, cross-linked to debt maturity | done | done | Shipped | #5 | contracts/interfaces/budget-data.md, contracts/interfaces/charts.md |
| GOV-8 | The laws — sortable/filterable explorer, cost, vote, enactment date | done | done | Shipped | #3, #31, #32, #33 | contracts/interfaces/law-data.md, contracts/interfaces/charts.md, contracts/interfaces/budget-data.md |
| GOV-9 | Who passed it, who signed it — the same $16.75T by voting coalition and by signing president, Radix Tabs | done | done | Shipped | #4, #33 | contracts/interfaces/attribution.md, contracts/interfaces/budget-data.md |
| GOV-10 | Where the money comes from — revenue by source (nominal/%GDP/%share toggle), OECD comparison | done | done | Shipped | #7, #34 | contracts/interfaces/revenue-data.md, contracts/interfaces/charts.md |
| GOV-11 | By state, and which states give more than they get — IRS gross collections vs USASpending award spending, tile-grid cartogram, sortable table, state tax mix | done | done | Shipped | #14 | contracts/interfaces/state-data.md, contracts/interfaces/charts.md |
| GOV-12 | What this cannot tell you — six limits in full, no disclosure wrapper, plus the concentration and deficit-vs-debt items. Limit 6 owns the place-of-payment principle (filer address vs place of performance) that §11 used to restate locally; §11 now links to it and keeps only its worked examples | done | n/a (prose) | Shipped | #8, #39 | contracts/interfaces/content-sources.md |

## Households route (`src/pages/households/index.astro`)

| ID | Capability | UI | Data | Status | Issue | Contract |
|----|-----------|----|------|--------|-------|----------|
| HH-1 | What a household earns — real median household income, 1984-2024, constant 2024 dollars, brushable year range | done | done | Shipped | #9 | contracts/interfaces/income-inequality-data.md, contracts/interfaces/charts.md |
| HH-2 | The spread — family Gini index 1947-2024 and CBO top 1% income share (two published points), shared brushable year range | done | done | Shipped | #9 | contracts/interfaces/income-inequality-data.md, contracts/interfaces/charts.md |
| HH-3 | A century of brackets — bracket count, thresholds in constant 2024 dollars, top statutory rate vs the schedule ladder top, 1913-2025 | done | done | Shipped | #10 | contracts/interfaces/bracket-history-data.md |
| HH-4 | Statutory is not effective — CBO average federal tax rate anchor points (includes payroll tax) against the top statutory rate | done | done | Shipped | #10 | contracts/interfaces/bracket-history-data.md |
| HH-5 | Who pays the income tax — AGI share paired with tax share by percentile group, and the five-year top-1% tax-share history | done | done | Shipped | #11 | contracts/interfaces/income-tax-by-group-data.md, contracts/interfaces/charts.md |
| HH-6 | The bill you do not see — payroll tax as a share of GDP and of total revenue, FY1962-FY2025 | done | done | Shipped | #11 | contracts/interfaces/charts.md |
| HH-7 | Limits — income-tax-only scope, families-not-households Gini basis, statutory-vs-effective, tax-unit basis | done | n/a | Shipped | #11 | — |

## Reference pages

| ID | Capability | UI | Data | Status | Issue | Contract |
|----|-----------|----|------|--------|-------|----------|
| REF-1 | /sources renders SOURCES.md in full, including known discrepancies — and the register is now **gated, not merely rendered**: every source cited by a published output's `_meta.source` must be findable in SOURCES.md or the build fails (see DATA-3) | done | done | Shipped | #8, #39 | contracts/interfaces/content-sources.md |

## Cross-cutting

| ID | Capability | UI | Data | Status | Issue | Contract |
|----|-----------|----|------|--------|-------|----------|
| DATA-1 | Every pipeline output is JSON-Schema validated on every build; an output with no schema fails the build rather than being skipped, so coverage cannot silently lapse as the population grows | n/a | done | Shipped | #14, #37 | contracts/interfaces/*.md § Schema |
| DATA-2 | The pipeline emits every CBO price series the sections need (CPI-U, chained CPI-U, core CPI-U, core PCE), rejects the one known corrupt upstream bracket row loudly at ingest and would catch a new duplicate bracket floor on the published output, and drift-checks both halves of the debt split | n/a | done | Shipped | #38 | contracts/interfaces/economy-data.md, contracts/interfaces/bracket-history-data.md |
| DATA-3 | Every source a published output cites is registered in SOURCES.md, the document /sources renders in full; the reconciliation runs unconditionally on every build, so a cited-but-unregistered source fails the build rather than shipping unnoticed | n/a | done | Shipped | #39 | contracts/interfaces/content-sources.md § Every cited source is registered |
| DATA-4 | Every pipeline HTTP request goes through one cached, fail-loud core — text, binary and POST-JSON callers are thin wrappers over the same cache, timeout, status and truncated-body discipline, so it cannot drift between them; there is no retry, by design | n/a | done | Shipped | #40 | contracts/interfaces/pipeline-http.md |
| DATA-5 | Every `_meta.title` year range is derived from `_meta.coverage` rather than typed by hand; a literal year in a curated title, a published range that names no declared coverage window, and a range with no coverage behind it all fail the build. One exemption, `cbo_effective_rates`, carries its written reason in the check | n/a | done | Shipped | #41 | contracts/interfaces/budget-data.md, contracts/interfaces/income-inequality-data.md, contracts/interfaces/curated-snapshots.md |
| DATA-6 | `BRIEF.md`'s "Files in this folder" manifest matches the files on disk, and cannot drift silently again — every path it lists is asserted to resolve, and the brief is named as the brief rather than as `README.md` | n/a | n/a | Shipped | #41 | — (BRIEF.md is itself the contract) |
| A11Y-1 | Shared-layer accessibility: no-JS data tables, named figure/nav landmarks, focusable skip target, SVG focus ring, JS-off chart legibility, token contrast enforcement, static conformance suite | done | n/a | Shipped | #15 | contracts/accessibility.md |
| A11Y-2 | Keyboard and assistive-technology sweep across all three routes and `/sources` — executed in a browser 2026-08-24 and 2026-08-26 (Chrome 151, WebKit 26.5): keyboard traversal, roving tabindex and focus restoration, 390px with scripting on and off, rendered-pixel contrast, and the greyscale pass with computed per-chart luminance ratios; results in `contracts/accessibility.md` § Manual pass results, FAILs filed as #62–#66, #69–#79. Remaining: the screen-reader passes on all four pages and the focus-ring check in Safari.app, which no agent can execute — **#80 blocks `Shipped`** | none | n/a | In progress | #30 | contracts/accessibility.md |
