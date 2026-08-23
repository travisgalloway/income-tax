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
| GOV-5 | The structural gap — revenue vs outlays, nominal / real / % of GDP toggle, sign-and-position surplus band | done | done | Shipped | #5 | contracts/interfaces/budget-data.md, contracts/interfaces/charts.md |
| GOV-6 | What Congress votes on — mandatory (net) vs discretionary vs net interest, nominal / real / % of GDP toggle, FY2015 trajectory marker | done | done | Shipped | #5 | contracts/interfaces/budget-data.md, contracts/interfaces/charts.md |
| GOV-7 | Net interest — the fastest-growing line | none | none | Planned | — | — |
| GOV-8 | The laws — sortable/filterable explorer, cost, vote, enactment date | none | none | Planned | — | — |
| GOV-9 | Who passed it, who signed it — attribution toggle | none | none | Planned | — | — |
| GOV-10 | Where the money comes from — revenue by source, brackets, OECD | none | none | Planned | — | — |
| GOV-11 | By state | none | none | Planned | — | — |
| GOV-12 | What this cannot tell you — caveats in full | none | none | Planned | — | — |
