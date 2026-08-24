# Feature matrix

Single view of what exists per route and how far along it is. One table per route, ordered as a
reader encounters the sections. Status vocabulary is fixed: `Planned`, `In progress`, `Shipped`,
`Deprecated`. A row moves to `Shipped` only when its issue's full definition of done passes, not
when the code merges.

## Government route (`src/pages/government/index.astro`)

| ID | Capability | UI | Data | Status | Issue | Contract |
|----|-----------|----|------|--------|-------|----------|
| GOV-1 | The $40 trillion — debt series, ten-year doubling, nominal / % of GDP toggle | done | done | Shipped | #1 | contracts/interfaces/budget-data.md |
| GOV-2 | Who holds it — public vs intragovernmental, domestic vs foreign | done | done | Shipped | #6 | contracts/interfaces/curated-snapshots.md, contracts/interfaces/charts.md |
| GOV-3 | How old is the debt — maturity ladder against the 30-year ceiling | done | done | Shipped | #6 | contracts/interfaces/curated-snapshots.md, contracts/interfaces/charts.md |
| GOV-4 | The whole budget — outlays stacked (mandatory net/discretionary/interest), revenue line, deficit below zero, party-control strip, unit toggle, year inspection, era bands | done | done | Shipped | #2 | contracts/interfaces/budget-data.md, contracts/interfaces/charts.md |
| GOV-5 | The structural gap — revenue vs outlays, nominal / real / % of GDP toggle, sign-and-position surplus band | done | done | Shipped | #5 | contracts/interfaces/budget-data.md, contracts/interfaces/charts.md |
| GOV-6 | What Congress votes on — mandatory (net) vs discretionary vs net interest, nominal / real / % of GDP toggle, FY2015 trajectory marker | done | done | Shipped | #5 | contracts/interfaces/budget-data.md, contracts/interfaces/charts.md |
| GOV-7 | Net interest — nominal/real bars by fiscal year, FY2015 trough and FY2003 series low marked, cross-linked to debt maturity | done | done | Shipped | #5 | contracts/interfaces/budget-data.md, contracts/interfaces/charts.md |
| GOV-8 | The laws — sortable/filterable explorer, cost, vote, enactment date | done | done | Shipped | #3 | contracts/interfaces/law-data.md, contracts/interfaces/charts.md, contracts/interfaces/budget-data.md |
| GOV-9 | Who passed it, who signed it — the same $16.75T by voting coalition and by signing president, Radix Tabs | done | done | Shipped | #4 | contracts/interfaces/attribution.md, contracts/interfaces/budget-data.md |
| GOV-10 | Where the money comes from — revenue by source (nominal/%GDP/%share toggle), OECD comparison | done | done | Shipped | #7 | contracts/interfaces/revenue-data.md, contracts/interfaces/charts.md |
| GOV-11 | By state | none | none | Planned | — | — |
| GOV-12 | What this cannot tell you — five limits in full, no disclosure wrapper, plus the concentration and deficit-vs-debt items | done | n/a (prose) | Shipped | #8 | contracts/interfaces/content-sources.md |

## Households route (`src/pages/households/index.astro`)

| ID | Capability | UI | Data | Status | Issue | Contract |
|----|-----------|----|------|--------|-------|----------|
| HH-1 | What a household earns — real median household income, 1984-2024, constant 2024 dollars, brushable year range | done | done | Shipped | #9 | contracts/interfaces/income-inequality-data.md, contracts/interfaces/charts.md |
| HH-2 | The spread — family Gini index 1947-2024 and CBO top 1% income share (two published points), shared brushable year range | done | done | Shipped | #9 | contracts/interfaces/income-inequality-data.md, contracts/interfaces/charts.md |
| HH-3 | A century of brackets — bracket count, thresholds in constant 2024 dollars, top statutory rate vs the schedule ladder top, 1913-2025 | done | done | Shipped | #10 | contracts/interfaces/bracket-history-data.md |
| HH-4 | Statutory is not effective — CBO average federal tax rate anchor points (includes payroll tax) against the top statutory rate | done | done | Shipped | #10 | contracts/interfaces/bracket-history-data.md |
| HH-5 | Who pays the income tax — share of AGI vs share of tax paid by group | none | none | Planned | — | — |
| HH-6 | The bill you do not see — payroll tax | none | none | Planned | — | — |
| HH-7 | Limits — caveats in full | none | none | Planned | — | — |

## Reference pages

| ID | Capability | UI | Data | Status | Issue | Contract |
|----|-----------|----|------|--------|-------|----------|
| REF-1 | /sources renders SOURCES.md in full, including known discrepancies | done | done | Shipped | #8 | contracts/interfaces/content-sources.md |
