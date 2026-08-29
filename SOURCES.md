# Sources

Every figure on the site traces to one of these. Vintages matter: several of
these series are revised, and quoting a number without its vintage is how this
material gets challenged.

---

## The sources

Each lead-in below names the source, then what KIND of source it is. The tier is not
prose: it is written on the register entry at `pipeline/curated/sources.yaml`, and
`check_sources` rule I fails the build if the two disagree. The five terms are
**primary** (the body that produced the data publishes it), **official republication**
(an official redistributor carries another agency's series unaltered), **scholarly
republication** (an academic or institutional publication of a primary record,
traceable back to it), **compilation** (assembled from named primary sources; not a
source in its own right) and **secondary** (anything else, and it must be argued).

**Congressional Budget Office, Historical Budget Data, February 2026** — primary
[github.com/US-CBO/cbo-data](https://github.com/US-CBO/cbo-data) → `data/budget/historical_budget/annual_fy_2026-02.csv`
Outlays by category, revenues by source, deficits, debt held by the public, all
in nominal dollars and as a share of GDP, FY1962 onward. Machine-readable.
Used for: sections 4, 5, 6, 7, 10.

**Congressional Budget Office, Historical Economic Data, February 2026** — primary
Same repo, [github.com/US-CBO/cbo-data](https://github.com/US-CBO/cbo-data) → `data/economic/historical_economic/annual_fy_2026-02.csv`
GDP price index, used to deflate every nominal series to FY2025 dollars.

**Congressional Budget Office, Estimates of Automatic Stabilizers, November 2024** — primary
Same repo, `data/budget/automatic_stabilizers/annual_fy_2024-11.csv`
Cyclical component of the deficit. Note the vintage: FY2025 is a projection in
this file, not an actual.

**US Treasury, Historical Debt Outstanding and Debt to the Penny** — primary
[fiscaldata.treasury.gov/datasets/debt-to-the-penny/debt-to-the-penny](https://fiscaldata.treasury.gov/datasets/debt-to-the-penny/debt-to-the-penny)
Total public debt outstanding at fiscal year end, and the daily series.
$40 trillion first closed above the threshold on 18 August 2026 at $40.047
trillion, and was reported the following day, 19 August 2026. Debt to the
Penny publishes a date's closing balance on the next business day, so these
are one event, not two figures. Debt to the Penny stood at $39.89T on
7 August 2026 and $39.84T on 30 July.

**US Treasury, Monthly Statement of the Public Debt** — primary
[fiscaldata.treasury.gov/datasets/monthly-statement-public-debt/summary-of-treasury-securities-outstanding](https://fiscaldata.treasury.gov/datasets/monthly-statement-public-debt/summary-of-treasury-securities-outstanding)
Instrument composition of marketable debt, May 2026 statement.
`api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/debt/mspd/mspd_table_1`,
machine-readable and fetched directly. Bills $6.76T (22%), notes $15.94T, bonds
$5.41T against a $30.91T marketable total; the remaining $2.80T is mostly TIPS
and floating-rate notes, plus a small Federal Financing Bank balance, which the
maturity chart does not draw. The pinned statement
month is recorded in `debt_maturity._meta.provenance.vintage` and moving it is an
editorial act, not a refresh. Until #56 these figures were curated constants
credited to the Peterson Foundation, and the total among them read $28.0T, which
is bills plus notes plus bonds rather than the marketable total.

**US Treasury, Treasury International Capital** — primary
Major Foreign Holders of Treasury Securities, November 2025 release.
[ticdata.treasury.gov/Publish/mfhhis01.txt](https://ticdata.treasury.gov/Publish/mfhhis01.txt),
machine-readable and fetched directly. Japan $1,202.7B, UK $879.8B, China $683.9B. Revised monthly; the
pinned release month is recorded in `debt_holders._meta.provenance.vintage` and
moving it is an editorial act, not a refresh.

**OECD, Revenue Statistics 2025, United States country note** — primary
[oecd.org/en/data/datasets/global-revenue-statistics-database.html](https://www.oecd.org/en/data/datasets/global-revenue-statistics-database.html)
2024 preliminary. US 25.6% of GDP, OECD average 34.1%, US ranked 31st of 38.
Counts all levels of government.

**IRS, Statistics of Income, individual tables by tax rate and income percentile, tax year 2023** — primary
[irs.gov/statistics/soi-tax-stats-individual-statistical-tables-by-tax-rate-and-income-percentile](https://www.irs.gov/statistics/soi-tax-stats-individual-statistical-tables-by-tax-rate-and-income-percentile)
Shares of AGI and of income tax paid by percentile group.

**Tax Foundation income-tax-rates dataset** — compilation
[github.com/TaxFoundation/data](https://github.com/TaxFoundation/data) → `income-tax-rates/income-tax-rates.csv`
The statutory bracket ladder by filing status, 1913-2019. It is a **compilation**
of IRS SOI Historical Table 23 and the IRS Revenue Procedures, not an independent
source: every number in it is a federal one, reorganised into per-bracket rows.
The CSV ends at 2019.

It is used instead of the IRS files themselves for a reason worth stating plainly,
because it is the one place this site reads a compiler rather than the original.
**The IRS does not publish the bracket ladder in machine-readable form at bracket
granularity.** Table 23 (below) is the closest thing, and it carries only two rates
per year, the lowest bracket and the highest, with no per-bracket rows and no
filing-status dimension. Probed directly in August 2026: `histab23.xls` is there and
current, `histab23.xlsx` is a 404, there is no Table 24, and nothing else in the SOI
historical-tables release carries the full schedules. So the Tax Foundation CSV is
the best available machine-readable form of data the government produced, and the
derivation is stated here rather than left in a script. The probe, with its URLs and
byte counts, is in `docs/contracts/interfaces/bracket-history-data.md`.

**IRS SOI Historical Table 23** — primary, and the **IRS Revenue Procedures** — primary
[irs.gov/pub/irs-soi/histab23.xls](https://www.irs.gov/pub/irs-soi/histab23.xls) — "U.S. Individual Income Tax: Personal
Exemptions and Lowest and Highest Bracket Tax Rates, and Tax Base for Regular Tax,
Tax Years 1913-2018". Table 23 is where the published top marginal rate comes from,
and since August 2026 it is checked rather than merely cited: its highest-bracket
column is transcribed, with the file's SHA-256, into
`pipeline/curated/top_rates_soi_anchor.yaml`, and the build fails if any year of the
top-rate series disagrees with it. All 106 overlapping years, 1913-2018, agree to
the digit. Table 23 stops at 2018 and is a legacy `.xls`; it is the envelope of the
bracket ladder, never the ladder itself.

Revenue Procedures 2018-57 through 2024-40, published in the Internal Revenue
Bulletin ([irs.gov/irb](https://www.irs.gov/irb)), and PL 115-97 behind them, carry the
2019-2025 schedules and the 37% top rate for those years, past where Table 23
reaches. They are hand-transcribed into `pipeline/curated/brackets_modern.yaml`
because no machine-readable feed publishes them; 2019 is transcribed too but used
only as a regression check against the fetched CSV, which stays authoritative for
that year.

**Statutory rate schedules** — primary
No single link: this is the bracket ladder assembled here, read as a top-rate series,
and any one URL would point at one of its inputs and claim to be the whole.
The bracket ladder above, read as a top-rate series. The statute's nominal top
bracket and the published top rate disagree in twelve years, where a credit,
surtax or part-year rate change moved the published figure; both numbers are
kept, and the reconciliation is in `pipeline/curated/bracket_adjustments.yaml`.

**FRED CPIAUCNS** — official republication
[fred.stlouisfed.org/series/CPIAUCNS](https://fred.stlouisfed.org/series/CPIAUCNS).
FRED carries the BLS series unaltered: the deflator is BLS's, the machine-readable
feed is FRED's. CPI-U, all urban consumers, not seasonally adjusted,
averaged to a calendar year. The deflator behind every constant-dollar bracket
threshold. Averaged, not sampled: taking a December observation for the year is
a different series and would move every real threshold.

**Census Bureau, via FRED** — official republication
[MEHOINUSA672N](https://fred.stlouisfed.org/series/MEHOINUSA672N) real median household
income in 2024 dollars, 1984-2024.
[GINIALLRF](https://fred.stlouisfed.org/series/GINIALLRF) family Gini index, 1947-2024.

**CBO, The Distribution of Household Income, 2022** — primary (published January 2026)
[cbo.gov/topics/income-distribution](https://www.cbo.gov/topics/income-distribution)
Top 1% share of income before transfers and taxes: 9% in 1979, 18% in 2022.

**CBO and Joint Committee on Taxation cost estimates** — primary
[cbo.gov/cost-estimates](https://www.cbo.gov/cost-estimates)
Ten-year scores for each of the 23 laws, as estimated at enactment.

**Joint Economic Committee, monthly debt update, August 2026** — official republication
[jec.senate.gov](https://www.jec.senate.gov)
Average maturity of marketable debt, 71 months as of June 2026. The committee
restates a figure Treasury's Office of Debt Management computes; it is an official
body carrying an official series, not the origin of the number.

**Peter G Peterson Foundation** — compilation
[pgpf.org](https://www.pgpf.org)
**Sources nothing.** It supplied the instrument shares of marketable debt until
#56, which was a compiler of the Monthly Statement of the Public Debt standing in
for the statement; the composition is fetched from Treasury directly now. It is
named here only as one side of the Federal Reserve holdings figure under Known
discrepancies below, which is the origin of a circulating claim rather than the
source of a published value. It is listed in `curated/sources.yaml` under
`not_a_source:`, so it cannot appear in any emitted dataset.

**Congressional Research Service and House/Senate historical records** — official republication
No single link: CRS's party-division tables, the House Clerk's archive and the Senate
Historical Office publish separately, and naming one would misdescribe the other two.
Party control of the presidency, House and Senate by Congress.

---

## Known discrepancies

Resolve these the way described. Do not silently pick a number.

**Foreign share of the debt.** A widely circulated 2025 figure (Al Jazeera,
20 August 2026, among others) puts foreign holders at 32% of gross debt. It is
answered by arithmetic, not by whose word it is against: foreign holders are
about 30% of the $32.14T held by the public, so about $9.6T; against $39.88T
gross that is 24%, not 32%. 32% is the share-of-public number wearing the gross
label. **Use: about 30% of publicly held debt, about a quarter of the total**,
and never a share without its denominator.

**China's holdings.** $683.9B and about $760B are the same series ten months
apart, not two sources disagreeing: Treasury International Capital reads 683.9
for the November 2025 release and 760.8 for January 2025. **Use the pinned
release, and name the month.** The pipeline fetches the figure from the release
itself and checks it against the resolution above rather than the reverse.

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

**Deficit total.** Cumulative FY1995-FY2025 deficits are $24.15T, but debt held
by the public rose $26.74T over the same period. The gap is borrowing to finance
federal credit programs and other means of financing, which do not appear in the
deficit. **If both numbers appear, explain the gap.**

---

## The counted vote splits, and what they still cannot tell you

This was the dataset's weakest point and is no longer. Each of the 23 laws
carries per-party yea and nay counts taken from Voteview roll-call records by
`pipeline/oneshot/party_splits.py`. PL 115-97 reproduces the published House
Clerk record on the caucus basis: House R 224-12, D 0-189; Senate R 51-0, D 0-48.

**Voteview roll-call records** — scholarly republication
[voteview.com/data](https://voteview.com/data). `HSall_members.csv` joined to the
per-congress roll-call and vote files.

**House Clerk record** — primary
[clerk.house.gov/Votes](https://clerk.house.gov/Votes). The chamber's own published
roll call, and the independent record the Voteview join is regressed against.

**Voteview is an academic republication of primary roll-call records, not a
secondary interpretation of them, and it is not a candidate for replacement**
(#56): the join it feeds is regressed against the independently published House
Clerk record for PL 115-97 at `pipeline/oneshot/party_splits.py`, which fails the
build if it drifts. Its `rollnumber` index is its own, at `698` for the TCJA's
final House passage, against the Clerk's session-scoped `RC699` for the same
vote on 20 December 2017. **The two numbers are not an inconsistency and must not
be reconciled**; `roll698.xml` at `clerk.house.gov` is H RES 66, a different
measure entirely.

Four limits remain, and section 11 states all four. The final-passage roll call
for each law was curated by hand, because a bill carries many roll calls and
selecting one by date returns the wrong vote. The House passed the CARES Act by
voice on 27 March 2020, so no roll call exists and one chamber of one law has no
split; **render that as missing data, never as unanimity and never as 0-0.** A
vote is called cross-party when at least 10% of the yes votes came from the
minority party in at least one chamber, which is a judgement and is stated so it
can be disagreed with. `r`, `d` and `i` are party membership; `d_caucus` adds the
independents who caucus with the Democrats, the basis the chamber records and
press coverage use, and the two differ by two Senate seats through most of this
period. **A chart must say which basis it shows.**

---

## State give-and-get

Government §11 compares what each state pays the federal government against what it gets back.
Four sources were probed; two were fetched, one was rejected outright, and one is cited but never
ingested.

**IRS Statistics of Income, SOI Data Book Table 5, Gross Collections by Type of Tax and State** — primary
[irs.gov/pub/irs-soi/](https://www.irs.gov/pub/irs-soi/) (basename discovered per run; FY2025 fetched as `25db-1-05-co.xlsx`, 61,340
bytes). Gross federal tax collections by state, classified by the filer's address. **This is
"give."** The workbook's own note: classification by state can misattribute a corporation's tax to
its principal office and a border employer's withholding to the wrong side of a state line.

**USASpending.gov** — primary
[www.usaspending.gov](https://www.usaspending.gov), `POST /api/v2/search/spending_by_geography/`.
Keyless, no API key required. Queried for the same fiscal-year window the IRS vintage covers (FY2025: 2024-10-01 to 2025-09-30),
returning 57 rows: the 50 states, DC, Puerto Rico, Guam, the US Virgin Islands, the Northern
Mariana Islands, American Samoa, and one row with an empty `shape_code` (unattributed award
spending, recorded in `_meta.coverage.unattributed_get_b` rather than dropped). **This is "get,"**
classified by **place of performance**, and it supplies the population denominator used for every
per-capita figure on both sides.

**US Census Bureau, Annual Survey of State Government Tax Collections (STC)** — primary
[census.gov/programs-surveys/stc.html](https://www.census.gov/programs-surveys/stc.html);
fetched from `www2.census.gov/programs-surveys/stc/tables/{year}/FY{year}-STC-Detailed-Table-Transposed.xlsx`,
vintage discovered per run (resolved to FY2025 at time of writing). States are columns, tax items
are rows keyed by Census item code; a cell of `X` means the state does not levy that tax at all
(Alaska has no general sales tax), a fact recorded distinctly from a genuinely missing figure.
Used for the state tax-mix figure.

**Census API (`api.census.gov`)** — **Rejected.** Every endpoint tried, including keyless
`timeseries/govs` and `2023/acs/acs1`, redirected to `data/missing_key.html`. No API secret is
introduced into this pipeline's CI.

**Rockefeller Institute of Government, state balance-of-payments studies** — scholarly republication
[rockinst.org/issue-area/balance-of-payments/](https://rockinst.org/issue-area/balance-of-payments/)
**Cited, never ingested.** Ruled 2026-08-26 (#56), in
`docs/contracts/interfaces/state-data.md`: kept as an attributed limitation. This is the authoritative balance-of-payments comparison and the honest name for what
a reader might expect §11 to be; its published series ends at FY2022 with no machine-readable feed.
Hand-transcribing a 50-state table from a PDF is exactly the fabrication risk this pipeline's
fetch-and-validate gate exists to prevent, so it is cited in body copy and never treated as data.

**The IRS and USASpending figures are deliberately FY-matched** (the USASpending fetch window is
derived from the discovered IRS fiscal year, never the other way independently), so give and get
compare the same twelve months by construction. The Census tax-mix vintage is discovered
separately and is not guaranteed to land on the same fiscal year as give and get in every future
run. Read `_meta.provenance.vintage` on the actual published output rather than assuming.

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
