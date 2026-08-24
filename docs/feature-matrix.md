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

## Economy route (`src/pages/index.astro`)

| ID | Capability | UI | Data | Status | Issue | Contract |
|----|-----------|----|------|--------|-------|----------|
| ECO-1 | One picture — real GDP FY1950-FY2036 on a log scale, actual/projection split | done | done | Shipped | #12 | contracts/interfaces/economy-data.md, contracts/interfaces/charts.md |
| ECO-2 | Growth and its shadow — output per hour vs. real median household income, indexed 1984=100 | done | done | Shipped | #12 | contracts/interfaces/economy-data.md, contracts/interfaces/charts.md |
| ECO-3 | Who works — unemployment vs. the noncyclical rate, and labour force participation | none | none | Planned | — | — |
| ECO-4 | Prices and rates | none | none | Planned | — | — |
| ECO-5 | Labor and capital | none | none | Planned | — | — |
| ECO-6 | Limits — what this route cannot tell you | none | none | Planned | — | — |
