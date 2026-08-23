# Feature matrix

Single view of what exists per route and how far along it is. One table per route, ordered as a
reader encounters the sections. Status vocabulary is fixed: `Planned`, `In progress`, `Shipped`,
`Deprecated`. A row moves to `Shipped` only when its issue's full definition of done passes, not
when the code merges.

## Government route (`src/pages/government/index.astro`)

| ID | Capability | UI | Data | Status | Issue | Contract |
|----|-----------|----|------|--------|-------|----------|
| GOV-1 | The $40 trillion — debt series, ten-year doubling, nominal / % of GDP toggle | done | done | Shipped | #1 | contracts/interfaces/budget-data.md |
| GOV-2 | Who holds it — public vs intragovernmental, domestic vs foreign | none | none | Planned | — | — |
| GOV-3 | How old is the debt — maturity ladder against the 30-year ceiling | none | none | Planned | — | — |
| GOV-4 | The whole budget — outlays stacked (mandatory net/discretionary/interest), revenue line, deficit below zero, party-control strip, unit toggle, year inspection, era bands | done | done | Shipped | #2 | contracts/interfaces/budget-data.md, contracts/interfaces/charts.md |
| GOV-5 | The structural gap — revenue vs outlays as % of GDP | none | none | Planned | — | — |
| GOV-6 | What Congress votes on — mandatory vs discretionary vs interest | none | none | Planned | — | — |
| GOV-7 | Net interest — the fastest-growing line | none | none | Planned | — | — |
| GOV-8 | The laws — sortable/filterable explorer, cost, vote, enactment date | none | none | Planned | — | — |
| GOV-9 | Who passed it, who signed it — attribution toggle | none | none | Planned | — | — |
| GOV-10 | Where the money comes from — revenue by source, brackets, OECD | none | none | Planned | — | — |
| GOV-11 | By state | none | none | Planned | — | — |
| GOV-12 | What this cannot tell you — caveats in full | none | none | Planned | — | — |

## Households route (`src/pages/households/index.astro`)

| ID | Capability | UI | Data | Status | Issue | Contract |
|----|-----------|----|------|--------|-------|----------|
| HH-1 | What a household earns — real median household income, 1984-2024, constant 2024 dollars, brushable year range | done | done | Shipped | #9 | contracts/interfaces/income-inequality-data.md, contracts/interfaces/charts.md |
| HH-2 | The spread — family Gini index 1947-2024 and CBO top 1% income share (two published points), shared brushable year range | none | none | Planned | — | — |
| HH-3 | A century of brackets — statutory bracket history | none | none | Planned | — | — |
| HH-4 | Statutory is not effective — statutory vs effective rate | none | none | Planned | — | — |
| HH-5 | Who pays the income tax — share of AGI vs share of tax paid by group | none | none | Planned | — | — |
| HH-6 | The bill you do not see — payroll tax | none | none | Planned | — | — |
| HH-7 | Limits — caveats in full | none | none | Planned | — | — |
