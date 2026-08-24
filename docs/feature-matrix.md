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

## Reference pages

| ID | Capability | UI | Data | Status | Issue | Contract |
|----|-----------|----|------|--------|-------|----------|
| REF-1 | /sources renders SOURCES.md in full, including known discrepancies | done | done | Shipped | #8 | contracts/interfaces/content-sources.md |
