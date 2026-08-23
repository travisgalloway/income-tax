# Sources

Every figure on the site traces to one of these. Vintages matter: several of
these series are revised, and quoting a number without its vintage is how this
material gets challenged.

---

## Primary

**Congressional Budget Office, Historical Budget Data, February 2026**
`github.com/US-CBO/cbo-data` → `data/budget/historical_budget/annual_fy_2026-02.csv`
Outlays by category, revenues by source, deficits, debt held by the public, all
in nominal dollars and as a share of GDP, FY1962 onward. Machine-readable.
Used for: sections 4, 5, 6, 7, 10.

**Congressional Budget Office, Historical Economic Data, February 2026**
Same repo, `data/economic/historical_economic/annual_fy_2026-02.csv`
GDP price index, used to deflate every nominal series to FY2025 dollars.

**Congressional Budget Office, Estimates of Automatic Stabilizers, November 2024**
Same repo, `data/budget/automatic_stabilizers/annual_fy_2024-11.csv`
Cyclical component of the deficit. Note the vintage: FY2025 is a projection in
this file, not an actual.

**US Treasury, Historical Debt Outstanding and Debt to the Penny**
`fiscaldata.treasury.gov`
Total public debt outstanding at fiscal year end, and the daily series.
$40 trillion first closed above the threshold on 18 August 2026 at $40.047
trillion, and was reported the following day, 19 August 2026. Debt to the
Penny publishes a date's closing balance on the next business day, so these
are one event, not two figures. Debt to the Penny stood at $39.89T on
7 August 2026 and $39.84T on 30 July.

**US Treasury, Monthly Statement of the Public Debt**
Instrument composition of marketable debt. Bills roughly 22%, notes about $15.9T,
bonds about $5.4T as of May 2026.

**US Treasury, Treasury International Capital**
Foreign holdings by country, 2025. Japan $1.203T, UK $889B, China $683B.
Revised monthly.

**OECD, Revenue Statistics 2025, United States country note**
2024 preliminary. US 25.6% of GDP, OECD average 34.1%, US ranked 31st of 38.
Counts all levels of government.

**IRS, Statistics of Income, individual tables by tax rate and income percentile, tax year 2023**
Shares of AGI and of income tax paid by percentile group.

**Census Bureau, via FRED**
`MEHOINUSA672N` real median household income in 2024 dollars, 1984–2024.
`GINIALLRF` family Gini index, 1947–2024.

**CBO, The Distribution of Household Income, 2022** (published January 2026)
Top 1% share of income before transfers and taxes: 9% in 1979, 18% in 2022.

**CBO and Joint Committee on Taxation cost estimates**
Ten-year scores for each of the 23 laws, as estimated at enactment.

**Joint Economic Committee, monthly debt update, August 2026**
Average maturity of marketable debt, 71 months as of June 2026.

**Congressional Research Service and House/Senate historical records**
Party control of the presidency, House and Senate by Congress.

---

## Known discrepancies

Resolve these the way described. Do not silently pick a number.

**Foreign share of the debt.** Al Jazeera (20 August 2026) reported foreign
holders at 32% of gross debt in 2025. That does not reconcile. Foreign holdings
are roughly 30% of the ~$32T held by the public, which is about $9.6T, or 24% of
$40T gross. The 32% figure appears to be a share-of-public-debt number labelled
as share-of-gross. **Use: about 30% of publicly held debt, about a quarter of the
total.**

**China's holdings.** Reported at $683B (TIC via Al Jazeera) and about $760B
(other current sources). Both plausible depending on vintage. **Use $683B with a
note that TIC is revised monthly.**

**Federal Reserve holdings.** Reported at $4.528T (Peterson Foundation) and about
$4.9T elsewhere. **Omit rather than pick.**

**Gini index.** The family series (GINIALLRF) reads 0.456 for 2024. Household
series run 0.47 to 0.49 depending on whether the source is CPS or ACS. The family
series is used because it runs cleanly to 1947. **Label it "families" on the
chart** or a reader will correct you with the household figure.

**Tax-to-GDP scope.** OECD 25.6% counts federal, state and local. CBO 17.2% is
federal only. Both are correct. **Never present them as a contradiction or as
comparable.**

**Net interest low point.** FY2015 at $223B is a recent trough, not the series
low. The actual low is FY2003 at $153B. **Say "trough," not "low."**

**Deficit total.** Cumulative FY1995–FY2025 deficits are $24.15T, but debt held
by the public rose $26.74T over the same period. The gap is borrowing to finance
federal credit programs and other means of financing, which do not appear in the
deficit. **If both numbers appear, explain the gap.**

---

## The vote composition limitation

This is the single weakest point in the dataset and the site must be upfront
about it.

Each of the 23 laws carries a `comp` field: `PLR` party-line Republican, `PLD`
party-line Democratic, `XP` cross-party. For **one** law, PL 115-97 (the Tax Cuts
and Jobs Act), the per-party split is verified from the House Clerk roll call
(House: R 224–12, D 0–189; Senate: R 51–0, D 0–48). For the other 22, the
classification is derived from the published vote character, not from counting
roll-call votes.

Exact per-party tallies for all 23 are available from Voteview
(`voteview.com/data`, `HSall_votes.csv` joined to `HSall_rollcalls.csv` and
`HSall_members.csv`). A script that does this join is in the parent folder as
`fetch_party_splits.py`. If someone runs it, replace the classifications with
counted splits and delete this caveat.

Until then: the site says "classified from published vote character" wherever
composition appears, and section 11 states it as a limitation.

---

## Attribution conventions used throughout

**Fiscal year assignment.** Each fiscal year is assigned to whoever held the
office in June of that fiscal year, and to the Congress seated for it. FY2026
began 1 October 2025. This means FY2025 belongs to Trump II, not Biden.

**Ten-year scores.** Costs are as estimated at enactment, not as realised. The
ACA was scored as deficit-reducing. The IRA was scored at $238B of savings and
CBO later revised its energy credit costs sharply upward. The 2012 fiscal cliff
deal scores as +$3.9T against current law and as deficit-reducing against current
policy: same bill. Scores from different eras are different instruments and
should not be summed casually; two 1997 laws predate the ten-year convention
entirely and carry no comparable figure.

**Mandatory spending.** The `ma` field is gross. Add `or` (offsetting receipts,
negative) to get the net figure, so that `ma + or + di + ni = ot`. Charts use the
net figure.
