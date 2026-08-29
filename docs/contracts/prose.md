# Contract: prose (`docs/contracts/prose.md`)

Prose was the only part of this site with no contract. `docs/contracts/accessibility.md` governs the
charts, and `docs/contracts/interfaces/` holds 15 data contracts. The words had one rule
(`BRIEF.md:79`, "Never use em dashes in prose"). That rule was broken on every route, banned a
character without naming a replacement, and had nothing behind it.

This contract has three parts, in the shape `docs/contracts/accessibility.md` uses. **Conventions**
are the rules. Each rule carries a worked pass and a worked fail at a real line, and each names the
test that enforces it or says plainly that none does. The **Rubric** is seven numbered criteria
adapted from OpenStax *Writing Guide* 8.7, one per craft dimension, each naming the issue that cites
it. The **Checklist** is what only a human reader can judge, and every item on it is marked NOT
EXECUTED today.

**What is enforced and what is not.** Punctuation and emphasis are mechanically checkable, and
`pipeline/tests/test_prose.py` fails the build on them. Everything else here is human judgement, and
that covers most of the document. A human reader judges whether a section states its question before
its first figure, whether a finding is falsifiable against the chart beside it, and whether a term is
defined the first time a reader meets it. Those are the rubric's business, and the rubric is read by
a person.

**The check reads `dist/`, not `src/`.** A scan of the page sources counts `---` frontmatter comments
and developer-facing `throw` strings as prose, and a reader meets neither. The same scan misses the
strings the islands assemble at runtime, which a reader does meet. The check is an allow-list over
four named classes and three named kinds of accessible name. The list is never a deny-list. Both
choices are argued in `pipeline/tests/test_prose.py`'s module docstring and again under **Scope**
below.

**Today's violations are enumerated.** `KNOWN_DASH_DEBT` and `KNOWN_SHOUT_DEBT` in
`pipeline/tests/test_prose.py` list every one, each mapped to the issue that owns its removal, and
both are asserted with `==`. None is exempted. A new violation fails the build on the new
fingerprint, and *fixing* one fails the build on the missing entry. The baseline can only shrink,
deliberately, in the same commit as the fix. Zero is #58's definition of done, plus #102 and #103 for
the two surfaces no prose edit can reach.

This document follows its own rules, and the quoted fail examples are the only em dashes in it.

## Genre

The genre is the **analytical report**, from OpenStax *Writing Guide* 8.3, "Glance at Genre: Informal
and Formal Analytical Reports". The genre requires that a claim arrive with the evidence a reader
needs to check it. The writer's job is to make the checking easy. Persuading the reader is not the
job. Every rule below follows from that.

The register is fixed and predates this contract. `sections.md:10-11` states it, and it survives here
verbatim:

> Register: plain, direct, figures always with units. No em dashes. Never assert causation the data
> does not support.

`BRIEF.md:196-203` adds the hype ban. Do not write "shocking," "staggering," or "crisis."

## Scope

Stated once here, implemented once in `pipeline/tests/test_prose.py`, and used by every mechanical
rule below.

A **prose element** is an element carrying one of four classes: `prose`, `standfirst`, `finding`,
`figure-caveat`. A **prose string** is a prose element's text, or one of three kinds of accessible
name: the `aria-label` of a `figure.figure`, the `aria-label` of an `svg.chart`, or the `aria-label`
of a `role="img"` element inside an `svg.chart`, which is a per-datum readout assembled at runtime.

Nothing else is a prose string. In particular:

- **`<span class="unit">—</span>` is not prose.** In a built table the character means "this column
  has no unit". The character is typographic, and `.unit` is outside the allow-list, so it needs no
  exemption. Do not add one.
- **The `Source.` span is not prose.** `src/components/Figure.astro:61` renders `fig.sourceLine`
  verbatim, and `src/components/Figure.astro:45-46` makes a missing one a build failure. The span
  carries no class, and `.figure-caveat` at `src/components/Figure.astro:60` is its *sibling* rather
  than its ancestor, so the check never visits it. See **Drift and quoted material**.
- **A glossary popover body is not this page's prose.** `src/components/Term.astro` renders the
  term's `short` into a `.term-pop` inside the paragraph. A reader sees the popover, and the text is
  still an entry under `src/content/glossary/` with its own editing surface and its own owner, #59.
  The extractor does not descend into `.term-pop`.
- **Control names are not prose.** A `nav` name, a `role="radiogroup"` name, a `role="tablist"` name
  and a `role="list"` name are governed by `docs/contracts/accessibility.md`, not by this contract.

## Conventions

**No em dash, and no ` -- ` either.** The ban stands (Ruling 1), and every job an em dash was doing
has a named replacement. Both worked fails are quoted historically, without a `path:line`, because
#58 fixed both. A citation bound to a quotation the line no longer supports is the one failure
`test_prose_contract_cites_lines_that_resolve` cannot catch, because the line still exists.

Fail, as `/economy` read before #58: "Every series on this route — GDP, prices, rates, the wage and
profit shares — is one number". The aside is itself a list, so it takes parentheses, and it now reads
"Every series on this route (GDP, prices, rates, the wage and profit shares) is one number".

Fail, as `/households` read before #58: "what people actually pay -- the average federal tax rate --
has moved far less". An appositive gloss takes a comma pair, and it now reads "what people actually
pay, the average federal tax rate, has moved far less". Pass:
`src/pages/government/index.astro:273-277`, which does the same work with a full stop and a new
sentence. Enforced by `test_no_prose_string_contains_an_em_dash_or_a_double_hyphen`.
**No all-caps emphasis.** Capitals are the `.kicker`'s role and nothing else's (Ruling 2). All
three worked fails are quoted historically, because #58 discharged all three and their lines no
longer carry them. Fail, as `/households` read before #58: "The bracket COUNT is a policy choice",
now a `<strong>` on the noun phrase, "The bracket **count** is a policy choice".

Fail, as `/households` read before #58: "Surtaxes ARE folded into the published top rate", now recast
to "Surtaxes are the exception: they are folded into the published top rate", which puts the emphasis
where the word order puts it. Fail, in a figure note, as `/households` read before #58: "it INCLUDES
PAYROLL TAX", now recast to "counts payroll tax, corporate income tax and excise tax as well as the
individual income tax", because a `note=` prop is a plain attribute rendered as text and cannot carry
markup.

Pass: `src/pages/government/index.astro:449` and `src/pages/government/index.astro:456`, which put
the emphasis on a `<strong>` noun phrase, and `src/pages/households/index.astro:262`, which does the
same for a numbered limit. Enforced by `test_no_prose_string_shouts`.

**Acronyms are registered.** An all-caps run of two or more letters is either in
`REGISTERED_INITIALISMS` in `pipeline/tests/test_prose.py` or it is a shout. Pass: "GDP", "CBO",
"OECD", and "PL 115-97" in the vote-splits note sourced from `src/data/party_splits.json:4`. A
CamelCase word is not a run, so "USASpending" and "HSall_members.csv" are matched as words rather
than as capitals. Adding an acronym means adding it to the set with a comment saying what it stands
for, which is a deliberate act and leaves a diff. Enforced by `test_no_prose_string_shouts`.

**Body copy is sentence case.** `BRIEF.md:79`. The kicker is not an exception, because it carries no
literal capitals. `src/styles/global.css:60-66` sets `font-variant-caps: all-small-caps` with
`letter-spacing: 0.09em` at `0.9375rem`, and no `text-transform`. Pass:
`src/pages/economy/index.astro:116` writes `<span class="section-no">Section 3</span>`, in sentence
case, and the CSS does the rest. There is therefore no kicker carve-out anywhere in this contract.
Enforced, for the capitals half, by `test_no_prose_string_shouts`.

**Numbers are always mono, and a sentence may open with one.** `BRIEF.md:75` makes mono numerals the
strongest cue tying the site to the deck. Sentence case and that mandate collide where prose opens
with a figure, and the ruling is that the numeral wins. Pass:
`src/pages/economy/index.astro:32-35`, "Real GDP was $2.38 trillion in fiscal 1950". Fail: spelling
the figure out, because `pipeline/curated/prose_figures.yaml` is watching that number and a spelled
form detaches the registry from the prose it describes. Not mechanically enforced.

**Every figure carries its unit.** `sections.md:10-11`. Pass: `src/pages/economy/index.astro:119`,
"Unemployment was 4.2% in fiscal 2025 against a noncyclical rate of 4.4%". Fail: any bare "4.2" in
running prose. Not mechanically enforced here. The *figure*'s axes are separately gated by
`src/components/Figure.astro:47`, which fails the build when either axis is unnamed.

**No causation the data does not support.** `BRIEF.md:202-203`. Pass:
`src/pages/economy/index.astro:109-112`, which states what a series shows and then says outright that
nothing here identifies a cause. Fail: any sentence in which one series "drove", "caused" or "led to"
another. Not mechanically enforced. Criterion 5 is where a reviewer catches it.

**No hype vocabulary.** `BRIEF.md:203` names three words: "shocking", "staggering", "crisis". The
rule is broader than the list, and the list is the floor. Not mechanically enforced.

**A finding states one claim a reader could falsify against the figure.** Pass:
`src/pages/economy/index.astro:122-125`, which gives the unrounded values, both series and the
comparison between them, in two sentences. Fail: a finding that restates the standfirst, or that
makes two claims joined by "and". Not mechanically enforced. Criterion 2 owns it.

**A chart's `aria-label` is prose, and it is the finding.** The `<figure>`'s name and the `<svg>`'s
name are deliberately the same sentence per `docs/contracts/accessibility.md`, so a convention that
moves one must move both, in the same commit. The label is additionally bound by
`pipeline/tests/test_accessibility.py:284-306`, which requires a digit, at least 40 characters, no
leading shape word, and never "chart showing".

Pass: `src/pages/economy/index.astro:128`. Fail: `src/components/islands/StatutoryVsEffective.tsx:97`,
which is a ` -- ` violation *inside* an accessible name, and is the reason
`dist/households/index.html` carries more banned dashes than its page source does. Enforced by
`test_no_prose_string_contains_an_em_dash_or_a_double_hyphen` and, for the accessibility half, by
`test_every_chart_svg_states_a_finding`.

**A cited line resolves.** Every `path:line` in this document points at a file that exists with at
least that many lines, and every path is repository-relative. Enforced by
`test_prose_contract_cites_lines_that_resolve`, which stops the citations in this contract drifting
out of date the way the seven checks removed on 2026-08-26 had drifted.

## Rulings

### Ruling 1: the em dash ban stands, and the prose is wrong

**The ban stands.** A dash set against the site's mandatory mono figures (`BRIEF.md:75`) reads as a
minus sign on pages full of deficits and negative rates. OpenStax *Writing Guide* 8.6 supplies a
comma-based alternative for every job these dashes are doing. Repealing the ban would bless three
incompatible conventions instead of replacing them with one.

`BRIEF.md:79` banned the character and named no replacement, which is why the ban was ignored. One
replacement per grammatical job makes remediation a mechanical pass rather than 37 judgements:

| Job | Example, as it read before #58 | Replacement |
|---|---|---|
| parenthetical aside | `/economy`: "Every series on this route — GDP, prices, rates, the wage and profit shares — is one number" | comma pair; parentheses where the aside is itself a list, as it is there |
| amplifying clause | `/government`: "not the balance-of-payments question it sounds like — what follows is narrower on both sides" | colon, or a full stop and a new sentence |
| appositive gloss | `/households`: "what people actually pay -- the average federal tax rate -- has moved far less" | comma pair |
| generated readout separator | `src/components/islands/BudgetChart.tsx:84` | full stop. The readout's other fields are already separated by ". ", so one template edit clears all 31 labels |

Rows 1 to 3 carry no `path:line`, for the reason given under **Conventions**. #58 fixed all three,
and a citation would now bind a quotation to a line that no longer supports it. Row 4 keeps its
citation because the line is #102's and is untouched.

Four scoping decisions, each stated so that no future issue reopens it:

1. **` -- ` is retired outright.** No ASCII stand-in is blessed. The pair of hyphens is not an em
   dash and is not a substitute for one, because it renders as two literal hyphens at every
   viewport. 10 instances reached `dist/` on the day this contract landed, all on `/households`.
   #53's Criterion 2 rewrites took two of them, leaving eight. #58 measured six still standing in
   prose classes and cleared all six, so **no ` -- ` reaches a reader in prose today**. The two
   that remain anywhere in `dist/` are both inside one chart's accessible name at
   `src/components/islands/StatutoryVsEffective.tsx:97`, which is #102's, and which is why a
   dist-wide grep is the wrong check.
2. **Numeric-range hyphens are out of scope.** "1946-1950" at
   `src/pages/households/index.astro:116` and "FY1995-FY2025" throughout are ranges. A hyphen
   between two numbers is a range operator rather than punctuation. **No en dash is introduced in
   its place.** The minus-sign ambiguity that justifies the em-dash ban applies to the en dash
   identically, so this site uses the hyphen and only the hyphen.
3. **Island-generated strings are in scope.** Anything a reader can read or hear is prose, including
   a string assembled at runtime. `src/components/islands/StatutoryVsEffective.tsx:97` proves the
   point, because it puts a banned construction inside an accessible name, which
   `docs/contracts/accessibility.md` also governs. Owner: **#102**, together with
   `src/components/islands/BudgetChart.tsx:84`.
4. **Curated pipeline data is out of scope for the dash and capitals rules, by name.**
   `pipeline/curated/laws.yaml:287` carries "VOICE VOTE" and `src/data/party_splits.json:22` carries
   "AT LEAST ONE". Both are authored by this repository but reach the page through generated JSON.
   Editing them means regenerating data and re-running validation, which is a pipeline change with
   its own gates rather than a prose edit. They are exempted by an **enumerated named set** in
   `pipeline/tests/test_prose.py`, never by a weakened assertion, and the exemption carries the issue
   that retires it: **#103**.

### Ruling 2: shouted capitals

**All-caps is reserved for the `.kicker` role and banned in body copy and figure notes.** The
replacement is `<strong>` on the emphasised noun phrase, which the pages already do at
`src/pages/government/index.astro:449`, `src/pages/government/index.astro:456` and
`src/pages/households/index.astro:262`. A recast that puts the emphasis where the word order puts it
is the second replacement.

Two refinements:

- **The kicker is not literal capitals**, so there is no carve-out. `src/styles/global.css:60-66` is
  `font-variant-caps: all-small-caps`; kicker source text is sentence case
  (`src/pages/economy/index.astro:116`) and passes the same mechanical check as body copy. The rule
  is uniform across every prose class.
- **Figure notes are ruled in, explicitly.** `src/components/Figure.astro:60` renders a `note` into
  the figcaption as `.figure-caveat`, and `.figure-caveat` is inside the allow-list. Without that
  rule, the figure note's "it INCLUDES PAYROLL TAX" would have stayed legal. All three shouts were
  assigned to **#58** as one pass, because splitting a three-instance fix across issues costs more
  than it documents. **#58 discharged all three**, with a `<strong>` on "count", a recast for
  "Surtaxes are the exception", and a recast for the note, which cannot carry markup. `#58`'s block
  of `KNOWN_SHOUT_DEBT` is empty, and the five entries that remain are all `#103`'s.

The rule governs emphasis. Acronyms are a separate question. A registered initialism is not a shout,
and the register lives in `REGISTERED_INITIALISMS` in `pipeline/tests/test_prose.py`.

### Ruling 3: `sections.md` is retired as an editing surface, and the file stays

**The three route pages are canonical prose.** `src/pages/economy/index.astro`,
`src/pages/government/index.astro` and `src/pages/households/index.astro` are where prose is written
and corrected. `sections.md` is not.

The reasoning is recorded here so that it is not reopened. A second copy of the prose is a drift
surface, for the same reason `docs/contracts/interfaces/content-sources.md` forbids a second prose
copy of the source list. `pipeline/curated/prose_figures.yaml` already registers sections E1 through
E6 for Economy sections the deck never contained. The deck's own header at `sections.md:3` says
"Eleven sections" while the file holds twelve.

**"Retired as an editing surface" does not mean "deleted", and eight tests depend on the
difference.** Eight cases in `pipeline/tests/test_pipeline.py` are anchored on the file, at
`pipeline/tests/test_pipeline.py:236`, `:254`, `:265`, `:457`, `:794`, `:1072`, `:1102` and `:1252`,
and `pipeline/lib/validate.py` cites it in five assertion messages. Deleting it breaks the pipeline
suite, which no prose issue owns. **New and corrected prose lands in the route pages only. The file
is a frozen historical record until a follow-on migrates those tests off it.**

**One exception has been taken, and it is recorded here rather than left implicit.** A repository-wide
style pass rewrote the file's own prose against `docs/contracts/prose.md`, removing its three em
dashes and holding every sentence to 20 words. No figure, heading, section number or asserted phrase
moved, and the pipeline suite stayed green. The file is still not an editing surface for *site*
copy, which is what this ruling governs.

The consequences are recorded here, and the change is deferred to that follow-on:

- `pipeline/lib/report.py:135` describes drift as being in "`content/sections.md`". That one string
  carries two errors. The deck is no longer the origin of quoted prose, and the path has been wrong
  since before #41 moved the file list, because the file is at the repository root and always was.
  `pipeline/lib/report.py:3` names the file correctly and is only wrong about the origin.
- `pipeline/curated/prose_figures.yaml:3` says the same thing in its `_comment`.
- `BRIEF.md:146` and `BRIEF.md:196` also say `content/sections.md`. They are not fixed by #51, which
  is capped at one line of `BRIEF.md` and spends it on `BRIEF.md:78-79`.
- The register line at `sections.md:10-11` survives verbatim in **Genre** above, which is the whole
  reason retiring the deck is safe.
- #31 is closed and never modified `sections.md`, so the ordering question #51's body raised is moot
  rather than deferred.

### Ruling 4: the heading register

Set by #60, because Criterion 5 asked what a heading and a standfirst are allowed to assert and the
contract had no answer. The obvious answer, a list of forbidden words, would have been the wrong one.

**The ruling.** *A heading and a standfirst may be pointed, and the site's second person is not a
fault. Neither may assert a claim the section's own figures cannot settle.*

Both halves carry equal weight. Deleting the site's register is not the goal. `BRIEF.md:24-25` makes
the site's job to let a reader check a thing for themselves rather than be persuaded of it. A flat
heading persuades no one, and it also fails to say what the section found. Criterion 1 already
requires a heading to state a question or a claim rather than name the variables, and a claim stated
flatly is still a claim.

Applied across the three routes, the ruling settled three sites and moved one:

| Site | Judgement |
|---|---|
| `/government` §3 `<h2>`, "The debt is younger than you think" | **Out.** The heading asserts a comparison against the reader's prior belief, and no chart on the page measures what the reader believed. Rewritten to "The debt is refinanced every few years, not every few decades", which is the same point stated as a claim the section's average-maturity figure settles. **The `how-old` anchor does not move.** The anchor is linked from `/economy` §4 and `/government` §7, and only the visible text changed |
| `/households` §4 `.prose`, "The gap between the two lines is the whole point of this section" | **In register.** The sentence tells a reader where to look, and it makes no claim about the world. The chart shows the gap, and the sentence names it as the thing worth reading |
| `/government` §12 `.standfirst`, "Read them before arguing with anyone about the charts above" | **In register.** Second person and pointed, and it asserts nothing about the data. The standfirst says what the limits block is for, which is Criterion 1's job for a standfirst |

**No word list is added, and none can be.** "May not assert a claim its section cannot support"
describes a reading of a heading against a chart. No token in the heading carries it. The mechanical
half already exists. `test_no_section_heading_names_the_charts_construction` catches a heading naming
the apparatus, and its own docstring says it cannot catch a heading naming the variables. Checklist
item 8 holds the rest, and this ruling is what that item now reads a heading against.

## Drift and quoted material

**No prose edit may move a number registered in `pipeline/curated/prose_figures.yaml`.** Rewording
*around* a figure is a prose change. Restating the figure is a data change, and it is out of scope
for every C-issue. The drift report (`pipeline/lib/report.py`) compares the registry against the data
and reports editorially rather than auto-correcting. A prose edit that moves a number therefore
leaves the registry silently describing something that is no longer on the page.

**Prose may round, and harmonising precision is not a prose fix.** `src/pages/economy/index.astro:119`
gives "4.2%" and `src/pages/economy/index.astro:123` gives "4.175%", the value the registry holds.
Both are correct, because the standfirst reads and the finding checks. The registered value must
appear at least once in its section. Every mention need not match it. A precision convention would
detach the registry from the prose it describes, which is the failure this section exists to prevent.

**A sentence may open with a numeral.** See the conventions above. Spelling a registered figure out
trades a typographic preference for a data-integrity hazard.

**`_meta.source` is quoted material and no prose rule may edit it.** The line is rendered verbatim at
`src/components/Figure.astro:61` and required at `src/components/Figure.astro:45-46`. The line is
also outside the check's allow-list by construction, because the span carries no class and
`.figure-caveat` is its sibling rather than its ancestor. The exclusion is deliberate, because a
deny-list check would have needed a class added to `src/components/Figure.astro` purely to express
the exemption.

**A `.finding` and its chart `aria-label` move together.** They are deliberately the same sentence
per `docs/contracts/accessibility.md`. A C-issue that edits a finding and not its label breaks the
accessibility contract silently. The label must still satisfy
`pipeline/tests/test_accessibility.py:284-306` afterwards: a digit, at least 40 characters, no
leading shape word.
## Rubric

Seven criteria, adapted from OpenStax *Writing Guide* 8.7, "Evaluation: Reviewing the Final Draft".
One per craft dimension. A C-issue cites **one** criterion by number and stops reading; that is what
the numbering is for.

### Criterion 1 — the question comes first

**Asks:** does the section state the question it answers before its first figure appears?
**Pass:** the kicker, heading and standfirst together name a question a reader could have asked, and
the chart then answers it. `src/pages/households/index.astro:225-230` poses it and
`src/pages/households/index.astro:244-250` answers it after the chart. **Fail:** the standfirst
summarises the chart the reader has not seen yet, so the figure arrives as evidence for a claim
rather than as an answer to a question. **Cited by #52.**

**The mechanical half.** The checker measures four positional and textual facts over the four report
routes' built pages. **Enforced by** `pipeline/tests/test_prose.py:453`, `:472`, `:491` and `:515`:
a `.standfirst` before the section's first `<figure>`; a `.prose` after its **last** `</figure>`; a
standfirst whose number tokens overlap its finding's by less than `PREEMPTION_CEILING`
(`pipeline/tests/test_prose.py:403`, 0.5) on Jaccard, because a standfirst quoting the finding's
exact figures posed no question; and no `<h2>` containing a word from `CONSTRUCTION_WORDS`.

Scope is structural, and no exemption list exists anywhere. A section is asked the first two
questions **because it carries a `<figure>`**, which discharges the three Limits sections and the
`/` intro's four. There is no baseline either. #52 found four violations and fixed all four, which
is the choice the rule below says to make at that count.

**What the checks cannot see.** They cannot see a heading that names the section's *variables*
instead of its question. "Prices and rates" and "Labor and capital" told the reader what was
plotted, neither said what was found, and both passed every word list anyone would write. #52
rewrote them by reading, to `src/pages/economy/index.astro:166` and
`src/pages/economy/index.astro:227`.

The checks also cannot see a standfirst that restates its finding **in words** rather than in
numbers, and they cannot judge whether the closing prose answers the question the standfirst actually
posed. Checklist item 8 holds that judgement, and a person makes it.

### Criterion 2 — the standfirst sets up, the finding claims

**Asks:** does the standfirst set the chart up, and does the finding state exactly one claim a reader
could falsify against the figure? **Pass:** `src/pages/economy/index.astro:118-125`, where the
standfirst rounds and orients and the finding gives the unrounded values and the comparison between
them. **Fail:** a finding that restates the standfirst, or that joins two claims with "and".
**Cited by #53.**

The pairing rule in **Drift and quoted material** binds this criterion. A finding edit moves the
matching `aria-label` in the same commit, and the label stays inside
`pipeline/tests/test_accessibility.py:284-306`.

**The mechanical half.** The checker measures four facts about every `.finding` on the four report
routes, and about the standfirst beside it. **Enforced by** `pipeline/tests/test_prose.py:635`,
`:661`, `:695` and `:720`: no standfirst and finding share a number token that is not a four-digit
calendar year; every finding and every `figure.figure` accessible name clears the finding-shape
floor; no finding runs past `FINDING_CHARS_MAX` (`pipeline/tests/test_prose.py:626`, 220 characters,
with the longest surviving finding at 193); and each section carries at most one finding,
immediately after its standfirst and before its first figure.

The calendar year is exempt as a regex class rather than as a list. A standfirst says over what
window and a finding says when, so both name the same years by construction. The floor is
`finding_shape_problems` at `pipeline/tests/test_accessibility.py:284`, extracted from
`test_every_chart_svg_states_a_finding` with no assertion changed. The finding and the accessible
name this contract calls the same sentence are therefore held to one predicate rather than to two
copies of one.

Scope is structural. A section is asked these questions **because it carries a `.finding`**, which
discharges the three Limits sections and the `/` intro's four with no exemption list.

**No baseline, and the count was 10.** #53 measured 10 live violations: six sections sharing a
non-year token, three findings past 220 characters and a fourth at 216 with no headroom left, and
one `figure.figure` name opening "Chart showing". At 10, rule 3 below points to #52's practice
rather than #51's. All 10 are fixed and every assertion above is zero. A 10-entry
`fingerprint -> "#owner"` map would have cost more to maintain than the 10 edits cost to make, and
there was no third party to hand it to. #58 owns sentence craft and #60 owns whether a reader can
check a claim, and neither owns a standfirst restating its finding.

**What the checks cannot see.** They cannot see whether a finding states *one* claim.
`government/index.html#whole-budget` is 68 characters and carries three figures, and a 200-character
finding can carry exactly one. Length is a proxy and the test says so, and no clause-counter or
"and"-splitter is added to fake the judgement.

The checks also cannot see whether a standfirst orients a reader at all, because a numberless
restatement of the finding in words passes every check here. They cannot see whether a finding and
the `aria-label` beside it agree, only that both clear the same floor. Checklist items 2, 3 and 9
below hold those judgements.

### Criterion 3 — sentence craft

**Asks:** sentence length, clause count, punctuation (Ruling 1) and emphasis (Ruling 2).
**Pass:** `src/pages/government/index.astro:273-277`, three sentences, one clause each, a full stop
where a dash was tempting. **Fail**, all quoted historically because #58 fixed every one of them:
"Every series on this route — GDP, prices, rates, the wage and profit shares — is one number" and
"what people actually pay -- the average federal tax rate -- has moved far less" for punctuation;
"The bracket COUNT is a policy choice", "Surtaxes ARE folded into the published top rate" and the
figure note's "it INCLUDES PAYROLL TAX" for emphasis.

Criterion 3 is the only criterion with a machine-checkable definition of done. **The baseline going
to zero is the criterion being met**, and #58 took it there. **Cited by #58.**

**The mechanical half now spans three of this checker's numbered blocks.** Sections 1 and 2 are
punctuation and emphasis, both `==` against the baselines. Section 8, added by #58, is sentence
length and word spacing. `pipeline/tests/test_prose.py:834` caps a prose sentence at
`SENTENCE_WORDS_MAX` (`pipeline/tests/test_prose.py:818`, 45 words),
`pipeline/tests/test_prose.py:900` fails a `.term` span that abuts a letter, digit or comma in the
served bytes, and `pipeline/tests/test_prose.py:946` gates the audit table below. All three assert
zero.

**The counts, and the exemption policy they chose (rule 3).** #58 met four numbers. It retired **23
dash fingerprints** over 24 em dashes and 6 ` -- ` occurrences, and **5 shout fingerprints** over 3
sites, by deleting them from #51's baselines entry by entry. That practice is #51's, already chosen,
and #58 emptied its block of each rather than replacing the mechanism.

The two *new* checks measured **7** sentences past 45 words and **5** term-boundary word-joins. Both
follow #52's practice: **fix them all and assert zero, with no baseline and no exemption list.** A
7-entry and a 5-entry `fingerprint -> "#owner"` map would cost more to maintain than the 12 edits
cost to make, and there is no third party to hand either to.

**Why 45 words, and why words rather than characters.** Measured across all 443 prose-class
sentences on the seven built pages before the edits: 50 ran past 30 words, 29 past 35, 13 past 40,
**7 past 45**, 3 past 50 and 2 past 55. 45 is the knee. A cap of 40 catches 13, several of them long
but orderly lists of caveats that read cleanly. A cap of 50 leaves standing the 46-word and 49-word
sentences that were the worst clause-stacking on the site.

The unit diverges from `FINDING_CHARS_MAX` (220 characters) deliberately, and the two disagree
materially here. The 49-word offender measured 320 characters while the 46-word one measured 241.
`FINDING_CHARS_MAX` is a **display-length** cap on one ruled-off sentence that a screen reader also
reads aloud in full. `SENTENCE_WORDS_MAX` is a **proxy for clause load**, where the word is the unit
a reader parses. The longest finding on the site is 40 words, so the two caps cannot collide.

**Scope, derived from structure (rule 2).** The length cap asks the four prose classes and not the
three kinds of accessible name. The boundary is scope rather than exemption. A chart's name is bound
by `docs/contracts/accessibility.md` and, where it is a finding, by `FINDING_CHARS_MAX` above, and
the island-generated per-datum readouts are `.tsx` templates owned by #102. Holding a readout a
number formatter assembles to a sentence-craft cap would be measuring the formatter. The word-join
check asks every `.term` inside every prose element, and punctuation that legitimately abuts, an
opening bracket or quote, is allowed by construction rather than by a list.

**What the checks cannot see.** They cannot see whether a sentence is *hard*. A 46-word sentence a
reader glides through and a 30-word one they have to restart score the same, because length is a
proxy and clause count is the judgement. No clause-counter and no proxy word list is invented to
fake it, which is Checklist item 10.

They cannot see the OpenStax 8.6 essential and nonessential judgement that decides whether a clause
takes commas at all. Ruling 1's replacement table is the mechanical half, and choosing which job a
given dash was doing is a reading. They cannot tell whether a split changed what a sentence claims,
which is Checklist item 11.

The word-join check also cannot see the **expression-boundary** variant of the same defect. The
collapse that fuses a text run with a `<Term>` also fuses it with a `{expr}`, which is how
`/contents` served "6 destinations,25 numbered figures". An interpolated value is indistinguishable
from literal text in the served bytes, so there is no span to anchor on. That variant is fixed by
hand and read by a person, as Checklist item 12.

### Criterion 4 — terms are defined

**Asks:** is every technical term defined the first time a reader meets it? **Pass:** a first use
wrapped in `<Term>`, as at `src/pages/economy/index.astro:33`, resolving to an entry under
`src/content/glossary/`. **Fail:** a term used on a route with no marker and no entry, or marked
somewhere a reader reaches *after* they have already met the word. **Cited by #59, which
discharged it.**

**Scope is markable prose: `prose`, `standfirst` and `finding`.** Three of `PROSE_CLASSES`' four,
and the fourth is out **structurally rather than by a list**. `.figure-caveat` renders
`src/components/Figure.astro:38`'s `note?: string`, a plain string prop that cannot carry a
component, and an `aria-label` is an attribute, which cannot carry one either. A term whose only
occurrence on a route is inside a figure note is therefore not a violation and needs no exemption
entry. `offsetting receipts`, `incidence` and `gdp-deflator` are all of that shape.

**A standfirst and a finding are first uses**, which is the substantive change #59 made to #47's
marking rule. Five of the seven violations #59 found were in one or the other. A finding and its
chart `aria-label` are deliberately the same sentence, and wrapping a word does not break that,
because `_deep_text` skips `.term-pop` and the served text is unchanged.

**First use is per route.** A reader arriving on `/households` has not read `/economy`, so
`first_used` is the site-wide first use and not the marking list. The population is the three keys
of `src/data/sections.ts`'s `routeSections`. `/`, `/sources` and `/glossary` are out of it because
they are not keys of that map, and `first_used.route`'s `z.enum` makes a term claiming one of them
a build failure.

**Two checks, both asserting zero with no baseline.**
`test_every_marked_term_sits_at_its_first_use` measured seven live violations and all seven were
fixed, which is rule 3's fix-all practice at that count, #52's rather than #51's. Neither existing
baseline was touched and no `KNOWN_*_DEBT` entry was added, because a baseline here would make the
assertion unfalsifiable in the only direction that matters.
`test_every_content_route_marks_every_glossary_term_it_uses` is the per-route half, and its
exceptions are `UNMARKED_AT_FIRST_USE` in `test_accessibility.py` **imported**, never copied.

**The `abbr` field is what makes this mechanical.** A reader meets `CBO` rather than "Congressional
Budget Office", and meets `intragovernmental` rather than "Intragovernmental holdings". Those short
forms are now data on the entry, and the checker searches for `term` plus every `abbr`. See
`docs/contracts/interfaces/glossary.md`. Declaring one can turn a green page red, which is the field
working.

**Interacts with Criterion 3, and #59 made the change this paragraph used to defer.**
`REGISTERED_INITIALISMS` is no longer hand-written. The set is `_INITIALISMS_WITH_NO_ENTRY`, the
acronyms this site cites but does not define, united with every all-caps surface form derived from
the glossary. `test_registered_initialisms_do_not_duplicate_the_glossary` asserts the two halves are
**disjoint**, so an acronym that gains an entry leaves the hand-named list in the same commit rather
than going stale there.

**What the checks cannot see.** They cannot see which *sense* of a word is on the page. `real money`
and `real terms` are the same four letters to a matcher, and no word list is invented to guess
between them, because a proxy for a reading reports green on exactly the sentences it gets wrong.
The failure message therefore offers two fixes, moving the marker or rewording the earlier sentence,
and Checklist item 4 stays NOT EXECUTED.

They cannot see a shortened form no one declared in `abbr`. The alternative is a fuzzy matcher, which
would flag "gross federal debt" as `gross debt` and be silenced the first time it did.

They cannot see prose assembled from curated data. `/government` §6's ‡ footnote is
`pipeline/curated/laws.yaml:287` rendered as a string, so its "No roll call exists" sits in a
`.prose` element that cannot carry a marker. `roll-call-vote` therefore declares no `roll call`
abbr, and that is a judgement, recorded here, rather than an oversight. They cannot see whether a
gloss **contradicts** the figure note on the same section, which is the issue's own sixth item and
is the new acronym-and-gloss Checklist item below.

### Criterion 5 — prose that lets the reader check

**Asks:** can a reader verify each claim from the figure and its source? No causation the data does
not support, no hype, figures always with units. **Pass:**
`src/pages/economy/index.astro:109-112`, which says outright that nothing in the section identifies a
cause. **Fail:** any sentence in which one series drives another, or any bare number without its
unit. **Drift and quoted material** bounds the criterion, so rewording around a figure is in scope
and restating the figure is not. **Cited by #60.**

**Its mechanical half is two tests**, under the `# 10.` banner in `pipeline/tests/test_prose.py`.
`test_every_registered_prose_figure_still_appears_in_the_prose` asserts that every `quoted` value in
`pipeline/curated/prose_figures.yaml` is still somewhere in the served prose. 118 are registered and
118 are present, so **0 are missing, asserted as zero with no baseline** (method rule 3's fix-all
practice, at a measured count of zero).

The test exists because a Criterion 5 pass is the edit most likely to break the registry silently. A
careless rewording *around* a figure takes the figure off the page, after which the drift report goes
on reconciling a number no reader meets, green forever on a check that is no longer looking at
anything. Matching is scale-tolerant and precision-tolerant by arithmetic rather than by a hand-kept
unit map, and it is anchored against digits so `39` cannot match inside `139`. The test asserts that
anchoring against itself before it trusts it, so a later widening of the tolerance fails loudly.

`test_the_criterion_five_audit_covers_every_section` is method rule 5. The audit table's
`(route, section id)` set **equals** the set built from `dist/`, 31 today.

**What they cannot see, and the three checks that were measured and rejected.** Neither test reads a
sentence. Which section carries a registered figure is invisible to the first, because the registry's
`section:` key is the retired deck's numbering (Ruling 3) and its bare-numeric keys `3`, `4` and `10`
do not all resolve to Government sections. No route-scoped assertion is available without re-keying
the registry, which is a pipeline change.

Whether the sentence around a figure supports what it claims is Checklist item 5. Whether a figure
note tells a reader what the chart cannot do is Checklist item 7. Three further checks were each
built, measured against the built site, and **rejected on the number**. They are recorded here so
that the small mechanical surface reads as a finding rather than an omission:

| Check considered | Measured against `dist/` | Why it was not added |
|---|---|---|
| A **causal-connective word list** (`because`, `this is why`, `which is why`, `accounts for`, `caused`, `as a result`, `since`, `so that`, `therefore`, `due to`, `reflects`) | **47 hits** through `prose_strings()`. 36 **method** (why a series starts where it starts, why a panel is separate, why an axis is not zero-based), 9 **temporal** ("since 1913", "since 1995"), **2 claims about the world** | 45 of 47 are legitimate, or **96%**. The list also found **2 of the 5** sites this issue was opened to fix, because three of the five drew their cause with no connective token in them at all. A list that is 96% false positives and 60% false negatives measures nothing. The judgement is a reading, and it is recorded in the audit table below |
| A **hype vocabulary list**, `BRIEF.md:203`'s three words plus 21 more (`dramatic`, `soaring`, `skyrocket`, `alarming`, `massive`, `devastating`, `runaway`, `obviously`, `clearly`, `of course`, `undeniabl`, …) | **22 of 24 words at zero**, `shocking` and `staggering` among them. `crisis` 1, in a `figure` `aria-label` naming the 2008-2009 financial crisis. `unprecedented` 1, in `/government` §12 limit 2, naming the distortion the limit warns against | Zero live violations, and both survivors are exemptions the criterion would have to enumerate by name. A 24-word list asserting zero on a site that already writes this way is a check that cannot fail, which method rule 4 rules out. The measurement is recorded, and the judgement is Checklist item 5 |
| A **number-without-its-unit detector**, Criterion 5's third clause | **5,753 numbers** in prose, of which **816** are not adjacent to `$` or `%` and are not a four-digit year. Almost all are legitimate: per-datum chart readouts (`Families Gini index, 1996: 0.425`), index values (`1984 = 100`), list numbering, section cross-references, ratios and arithmetic identities (`77.0 = 70 x 1.1`) | Separating the 816 needs a hand-kept vocabulary of allowed units *and* allowed non-unit contexts, which is the stale list method rule 2 forbids. Not mechanically checkable here. Human-judged, and the audit table's column 3 is where a section declares what a reader checks its figures against |

### Criterion 6 — hand-off

**Asks:** does each section hand off to the next, and each route to the next, rather than stopping?
**Pass:** the Economy route's section 6 limits block, which hands off to `/households` and is already
recorded as `Shipped` on `ECO-6` in `docs/feature-matrix.md`. **Fail:** a terminal section that ends
on its last caveat with nowhere to go. **Cited by #61.**

**Its mechanical half is four tests**, under the `# 11.` banner in `pipeline/tests/test_prose.py`.
All four assert **zero with no baseline**, which is method rule 3's fix-all practice, taken at the
counts below. Those are the counts #61 measured against a clean `dist/` before it wrote a sentence.

| Check | What it asserts | Measured before #61 |
|---|---|---|
| `test_every_in_prose_cross_reference_resolves_and_is_base_aware` | Every `/`- or `#`-rooted href inside a prose element begins with the served base path, names a route `dist/` actually built, and lands on an `id` that exists on that built page | **12 in-prose cross-references, 12 resolving, 0 not base-aware.** The issue's central premise, that three cross-route links skip the base, was **already discharged** by #43/#70, which fixed exactly those three, and by #49, which moved `join()` out of `BaseLayout.astro` so the site has one implementation of the base join |
| `test_every_joint_of_the_route_ladder_is_written` | Each content route, in `routeSections` order, carries an **in-prose** link to the route after it | **1 of 2 joints written.** `/economy` §6 handed off to `/households`, and `/households` carried **zero** links to `/government` in any sentence a reader reads |
| `test_the_last_routes_ending_points_back_into_the_argument` | The closing `.prose` of the terminal section of the terminal route links something other than `/sources`, `/glossary` and `/contents` | **0 such links.** The site's last paragraph was a Sources line and nothing else |
| `test_the_criterion_six_audit_covers_every_section` | Method rule 5: the audit table's `(route, section id)` set **equals** the set built from `dist/`, 31 today | 29 sections: 4 on `/`, 6 on `/economy`, 7 on `/households`, 12 on `/government` |

The first three exist because a check that already passes is what a copy pass needs. #61 added six
new cross-references, taking the page-wide total from 12 to 18, and without those checks the next
link written by hand reintroduces #70's production bug silently.

**Prose-scoping is what makes the second and third checks non-trivial.** The rail and the
narrow-viewport navbar link every route from every page, so an unscoped grep for `government` in the
built Households page returned a non-zero count on the day the issue opened and would have passed
vacuously. Two exclusions do the scoping, both taken from markup rather than from a list of hrefs.
An `<a>` inside `Term.astro`'s `span.term` is a glossary marker rather than a cross-reference, for
the same reason `EXCLUDED_DESCENDANT_CLASS` keeps `.term-pop` out of prose text. The rail, the navbar
and a figure's source line carry no prose class, so scoping to `PROSE_CLASSES` excludes the whole of
the site's furniture, and every `https://` source link with it, without naming one of them.

**What they cannot see.** None of the four reads a sentence. They see that a link exists and that it
resolves. They see nothing about whether the sentence around it hands the reader on, and nothing
about whether the section it points at **delivers what the sentence promised**. That is this issue's
own worst edge case, because a transition that promises what the target does not deliver is worse
than no transition. Both halves are **Checklist item 14**, and Checklist item 1 says the same thing
from the reader's side.

**Coverage, and why it is not a quota.** Six of the 29 sections named a destination in their closing
prose before #61, and nine did anywhere in the section. The other 20 name nowhere. That count is
recorded per section in the **Criterion 6 audit** table below rather than turned into an assertion.
"Ends here, and correctly: it is a construction caveat bounding the chart above, and the section's
question is closed" is a legal answer in column 3, and it is the answer for most of the 20.

No section on any of the four routes ends on a stub.
`test_every_section_with_a_figure_answers_after_it` has made a closing `.prose` mandatory since #52,
and the issue's own "ends on a bare `</Figure>`" snippet printed nothing.

**Three checks were measured and refused.** They are recorded here with their numbers so that the
small mechanical surface reads as a finding rather than an omission:

| Check considered | Measured | Why it was not added |
|---|---|---|
| A **transition-word list** (`however`, `therefore`, `next`, `finally`, `so`, `which is why`) | The four hand-offs the issue itself names as its model, `/economy` §4 and §6 and `/government` §3 and §7, contain **none** of those words. Every one of them hands off by *naming the destination and linking it* | It would score **zero on all four of its own worked passes**, while passing any paragraph that says "finally" and goes nowhere. The half that is real is the link, and the three checks above are that half. This would have been the tenth not-looking check this repository has removed |
| A **link quota**, requiring every section's closing prose to contain a cross-reference | **20 of 29 sections** named no destination anywhere | Structural rather than lexical, so ruling 2 does not catch it. What catches it is the issue's own edge case. At 20 short, the quota manufactures 20 links to satisfy an assertion, and the ones with nowhere honest to point would point somewhere dishonest. Coverage is recorded in the audit table instead, where "this section ends, and here is why that is right" is a legal answer |
| A **closing-prose word floor** | Shortest closing prose on the day the issue opened was **14 words**, `/government` §12's Sources line | That paragraph is one of this issue's two targets, and it is a target because of what it *said* rather than its length. A floor set above 14 would have fired on the sentence the issue rewrote anyway, and on nothing else |

### Criterion 7 — drift and quoted material

**Asks:** does the edit leave the registry, the source line and the accessible name where it found
them? **Pass:** a reworded paragraph whose registered figure is unchanged, whose `_meta.source` is
untouched, and whose finding and `aria-label` moved together. **Fail:** any one of the three moved
alone. Cross-cutting, and **cited by all six** C-issues. Its surfaces are
`pipeline/curated/prose_figures.yaml`, `src/components/Figure.astro:45-46` and
`src/components/Figure.astro:61`, and `pipeline/tests/test_accessibility.py:284-306`.

### How a C-issue lands its criterion

Five rules, set by #52 and followed by #53, #58, #59, #60 and #61. They exist so that six issues
against one contract produce one checker and one contract rather than six of each.

1. **One checker.** A criterion's mechanical half becomes tests in `pipeline/tests/test_prose.py`,
   under a numbered `# N. Criterion N — <name>` banner matching the ones already there, reusing
   `parse_html`, `nodes_of`, `PROSE_CLASSES` and `_deep_text`, and reading `dist/**/index.html`. No
   new test file, no second extractor, no source-level grep. The served bytes are the subject, for
   the reason the module docstring gives.
2. **Scope is derived from structure, never from a hand-kept list.** A section with no `<figure>` is
   outside "a `.prose` after the last figure" *because it has no figure*, and not because it is
   named in an exemption set. A list that must be maintained goes stale, and a stale list reads as
   a passing check.
3. **The exemption policy is chosen by the violation count, and the choice is stated.** At a few
   live violations, the issue **fixes them all and asserts zero with no baseline**, which is #52's
   practice, taken at four. At many, the issue **baselines them as `fingerprint -> "#owner"`
   asserted with `==`**, which is #51's practice, taken at 26 dash fingerprints, with the baseline
   reaching zero becoming #58's definition of done. Neither is the default. The count decides, and
   the plan says which and why.
4. **The human-judged half is written into the Checklist below as a numbered item marked
   NOT EXECUTED, citing its criterion by number**, and the mechanical check's docstring says out
   loud what it cannot see. No check is dressed up as automation. A word list invented to make a
   human judgement look mechanical is worse than no check, because it reports green.
5. **The per-surface judgement is recorded here, one row per surface, and gated by a test** that
   asserts the table's row set **equals** the set built from `dist/`. The judgement does not live in
   a PR body, which nothing can re-read and nothing can fail on. A new section then cannot ship
   without declaring what question it answers, and a deleted one cannot leave a stale judgement
   behind.

This contract, `docs/feature-matrix.md` and `docs/test-plan.md` move in the same commits as the code,
as they do everywhere in this repository. The rule is restated here because all six of these issues
are docs-adjacent, and the temptation to batch the docs into a trailing commit is strongest where the
docs are most of the diff.

### What each downstream issue attaches to

| Criterion | Issue | Attaches to |
|---|---|---|
| 1 | **#52** | The `.kicker` + heading + `.standfirst` block opening each section across the three route pages. Prose only: no figure, no data and no `aria-label` change |
| 2 | **#53** | `.standfirst` and `.finding` elements, 13 and 11 on `/government`, 8 and 6 on `/households`, 7 and 5 on `/economy`. Constrained by the pairing rule above |
| 3 | **#58** | **Discharged.** #58 took what was left of the day-one baseline, 23 prose-class dash fingerprints over 30 rendered occurrences, six of them ` -- ` on `/households`, and the three shouts in `/households` sections 3 and 4, and deleted every one, each in the same commit as its edit. The baseline opened at 26 over 33, and #53 retired three, because Criterion 2 made it rewrite those three sentences and a rewritten sentence takes its dash with it. #58 also set the sentence-length cap this criterion had left open and split the seven sentences over it, and fixed six reader-visible word-joins. **The remainder is owned rather than orphaned. `KNOWN_DASH_DEBT` holds exactly 4 entries, all `#102`, and `KNOWN_SHOUT_DEBT` holds exactly 5, all `#103`.** Both stay non-empty, so `test_the_baselines_are_declining`'s `assert baseline` still holds and neither check stops looking |
| 4 | **#59** | `src/content/glossary/` (23 entries), `src/components/Term.astro`, and each route's first use of each term. Owns any move of `REGISTERED_INITIALISMS` onto the glossary |
| 5 | **#60** | `.prose` bodies and `.figure-caveat` notes across all three routes, plus the Government route's section 12 limits block |
| 6 | **#61** | The closing paragraph of each section and the terminal section of each route: Economy section 6, Households section 7, Government section 12 |
| 7 | all six | `pipeline/curated/prose_figures.yaml`, `src/components/Figure.astro:45-46` and `src/components/Figure.astro:61`, and `pipeline/tests/test_accessibility.py:284-306` |

Two surfaces no C-issue can reach, each filed and each named beside the baseline entries it owns:

- **#102**, the island-generated accessible names. `src/components/islands/BudgetChart.tsx:84` (31
  per-fiscal-year labels from one template) and
  `src/components/islands/StatutoryVsEffective.tsx:97` (` -- ` inside a chart's accessible name).
  Both are `.tsx` edits, outside #58's prose-editing remit.
- **#103**, the curated-data shouts. `pipeline/curated/laws.yaml:287` and
  `src/data/party_splits.json:22`. A pipeline change requiring regeneration and revalidation.

### Criterion 1 audit

One row per `<section id>` on the four report routes, 29 of them. The question is a reviewer's
one-line paraphrase of what the section's kicker, heading and standfirst pose before the reader
meets a chart. `pipeline/tests/test_prose.py:570` asserts this table's `Route` and `Section id` set
**equals** the set built from `dist/`, so a section cannot ship without declaring its question and
a deleted section cannot leave its judgement behind. The test asserts the **coverage** and never
the wording. Whether the paraphrase is honest, and whether the closing prose answers it, is
Checklist item 8.

| Route | Section id | The question it answers | Criterion 1 |
|---|---|---|---|
| / | purpose-and-scope | What does this site present, and what falls outside its scope? | Pass |
| / | data-and-coverage | What span does each route cover, and which destinations exist? | Pass |
| / | reading-a-figure | What are the parts of a figure here, and in what order do they appear? | Pass |
| / | provenance-and-method | Who publishes these numbers, and on what dating basis? | Pass |
| / | impartiality-and-its-limits | What holds the site's impartiality in place, and where does it stop? | Pass |
| / | suggested-reading-order | In what order do the three routes fit together? | Pass |
| /economy | one-picture | How much more does the economy produce than it did in 1950? | Pass |
| /economy | growth-shadow | Did what a household got keep up with what an hour of work produces? | Pass |
| /economy | who-works | How many people are working, and who does the unemployment rate leave out? | Pass |
| /economy | prices-rates | Was a given interest rate high or low, and against what were prices doing at the time? | Pass |
| /economy | labor-capital | Which way has each of the wage share and the profit share of GDP moved since 1950? | Pass |
| /economy | limits | What can this route not tell you, and where does the reader go next? | Pass |
| /households | what-a-household-earns | What does a household in the middle earn, and how far back can that be measured? | Pass |
| /households | the-spread | How far apart are households, and has the distance grown? | Pass |
| /households | a-century-of-brackets | How many brackets has the income tax had, and where has the top one started? | Pass |
| /households | statutory-vs-effective | Does anybody actually pay the top rate? | Pass |
| /households | who-pays | Who pays the federal individual income tax, and in what proportion to what they earn? | Pass |
| /households | the-bill-you-do-not-see | Which of the two federal bills on a wage is the larger, and for which households? | Pass |
| /households | limits | What can this route not tell you, before its charts are used in an argument? | Pass |
| /government | forty-trillion | How fast has the debt grown, and does it look the same measured against the economy? | Pass |
| /government | who-holds-it | Who is the federal debt actually owed to? | Pass |
| /government | how-old | How soon does the debt outstanding have to be refinanced? | Pass |
| /government | whole-budget | What went out, what came in, and how big is the gap next to the budget that produced it? | Pass |
| /government | structural-gap | Over three decades, which side of the budget moved: revenue or spending? | Pass |
| /government | what-congress-votes-on | How much of the budget does an annual appropriation actually set? | Pass |
| /government | net-interest | What does every prior year's borrowing cost now, and who votes on that cost? | Pass |
| /government | the-laws | Which laws moved the deficit since 1995, and what was each scored to cost? | Pass |
| /government | passed-signed | Who voted for the scored cost, and who signed it? | Pass |
| /government | where-money-comes-from | Where does federal revenue come from, and has the mix changed? | Pass |
| /government | by-state | Which states pay in more federal tax than they receive in federal spending? | Pass |
| /government | limits | What can this data not settle, whatever the charts appear to show? | Pass |

Seven of these rows carry no `<figure>`: the four `/` intro sections, and the Limits section closing
each of the three routes. They are scored on the question alone, because "a standfirst before the
first figure" and "prose after the last figure" are not asked of a section that has no figure. Rule
2 above sets that structural scope, and it is why this contract has no exemption list.

### Criterion 2 audit

One row per `.finding` on the four report routes, 22 of them. `The one claim it makes` is a
reviewer's paraphrase of the single thing the finding asserts. `Checkable against` names the figure
whose `<details>` table settles it, which is where the two-figure sections are discharged, because a
finding cannot be checkable against both. `pipeline/tests/test_prose.py:759` asserts this table's
`Route` and `Section id` set **equals** the set of sections carrying a finding in `dist/`. The test
asserts the coverage and never the wording. Whether the paraphrase is honest, and whether the
finding really states one claim rather than two, is Checklist item 9.

The `/` intro carries no finding and no figure, so it contributes no rows. Structural scope explains
the absence, and no exemption is involved.

| Route | Section id | The one claim it makes | Checkable against | Criterion 2 |
|---|---|---|---|---|
| /economy | one-picture | Real GDP grew 895% between FY1950 and FY2025 | the section's one figure | Pass |
| /economy | growth-shadow | The two indexed lines separated: output per hour reached 216.5 by 2024 against real median household income at 138.6 | the section's one figure | Pass |
| /economy | who-works | Unemployment in FY2025 sat below CBO's noncyclical rate, while participation sat 4.7 points below its FY2000 peak | the section's one figure | Pass |
| /economy | prices-rates | The fed funds rate peaked one fiscal year after CPI-U inflation did | the section's one figure, rates panel against prices panel | Pass |
| /economy | labor-capital | The wage share fell over the same decades in which the profit share rose | the section's one figure | Pass |
| /households | what-a-household-earns | Real median household income rose 28.1% between 1995 and 2024, in constant 2024 dollars | `median-income` | Pass |
| /households | the-spread | Both published measures of the spread widened across their own windows | `the-spread`, whose table carries the Gini series and the two CBO anchor points | Pass |
| /households | a-century-of-brackets | The real income at which the top bracket begins has fallen about 96% since 1913 | `bracket-history`, threshold column in constant 2024 dollars | Pass |
| /households | statutory-vs-effective | The rate the top 1% actually paid moved far less than the statutory rate above it | `statutory-vs-effective` | Pass |
| /households | who-pays | The top 1% paid a share of the income tax close to twice its share of income | `who-pays`, the first of the section's two figures; `top1-share` answers a different question and the finding does not claim it | Pass |
| /households | the-bill-you-do-not-see | In aggregate the individual income tax is the larger of the two federal bills on a wage | `payroll-bill` | Pass |
| /government | forty-trillion | Gross debt doubled over the ten fiscal years to August 2026 | `debt`, nominal series | Pass |
| /government | who-holds-it | Four fifths of the gross debt is owed to the public rather than to the government itself | `debt-holders` | Pass |
| /government | how-old | Average maturity is 71 months, with roughly a third of the stock maturing inside a year | `debt-maturity` | Pass |
| /government | whole-budget | FY2025 spent $1.78 trillion more than it took in | `whole-budget` | Pass |
| /government | structural-gap | Across the 31 years outlays averaged about four points of GDP above revenue | `structural-gap` | Pass |
| /government | what-congress-votes-on | Over three decades the shift in the budget's shape was mandatory's, not discretionary's or net interest's | `voted-and-not` | Pass |
| /government | net-interest | The 31 years of net interest come to 39% of the deficits run in them | `net-interest` | Pass |
| /government | the-laws | Cross-party laws outweigh every party-line law combined, on both count and score | `law-explorer` | Pass |
| /government | passed-signed | Both attributions of the scored cost total the same $16.75 trillion | `attribution`, whose table carries both columns' totals | Pass |
| /government | where-money-comes-from | Over three decades the revenue mix tilted toward the individual income tax and away from payroll and corporate tax | `revenue`, the first of the section's two figures; `oecd` is an international comparison the finding does not claim | Pass |
| /government | by-state | More states receive more federal spending per person than they pay in federal tax than the reverse | `state-give-get`, the first of the section's two figures; `state-tax-mix` is a different question | Pass |

### Criterion 3 audit

One row per **built page**, seven of them. Criterion 3's surface is the page rather than the
section, because punctuation and emphasis conventions are page-wide and both baselines above are
keyed by page. `What its sentence craft turns on` is a reviewer's one-line paraphrase of the pressure
this page's prose is under. `pipeline/tests/test_prose.py:946` asserts this table's page set
**equals** the set `dist/` carries, so a new route cannot ship without declaring what its sentence
craft turns on and a deleted one cannot leave its judgement behind.

The test asserts the **coverage** and never the wording. **No measured counts sit in this table**,
because a count goes stale on the next prose edit and the test would then be asserting a number it
cannot maintain.

| Page | What its sentence craft turns on | Criterion 3 |
|---|---|---|
| `index.html` | Pure exposition with no chart to lean on: four sections that have to survive as sentences alone. Its dashes were doing a definition's job, so they became colons and full stops, and its two longest sentences were single-breath inventories that split cleanly at the point the inventory begins | Pass |
| `contents/index.html` | One standfirst over a wholly generated index. Every count in it is interpolated, so the sentence has to read correctly across four `{expr}` boundaries as well as scan, which is where the served bytes fused "destinations,25" | Pass |
| `economy/index.html` | Derivation prose: index start years, one-year offsets and deflator bases, chained behind colons and semicolons. Both of its over-long sentences were derivations stacked into one, and both split at the derivation rather than at a comma | Pass |
| `government/index.html` | The longest route and the most caveat-dense. Its over-long sentences were vintage and scope qualifications queued behind a colon; each qualification is now its own sentence, which is also what let the two ` -- `-free asides drop their dashes without losing the pause | Pass |
| `households/index.html` | Where every ` -- ` and all three shouted-capital emphases lived. Emphasis matters most here because the statutory-versus-effective distinction is the route's whole argument, and it now travels by `<strong>` or by word order, never by capitals | Pass |
| `glossary/index.html` | One standfirst of its own; everything else a reader meets on the page is a glossary entry authored under `src/content/glossary/` and owned by #59. The criterion bites on that one sentence and no further | Pass |
| `sources/index.html` | Carries no prose-class element at all. The page renders `SOURCES.md`, which is quoted register material no prose rule may edit, so there is nothing here for this criterion to hold and the row says so rather than leaving the page undeclared | Pass |

The last two rows are not exemptions. They read a structural scope, because a page is asked this
criterion of whatever prose-class elements it carries, and two of the seven carry one element and
none respectively.

### Criterion 4 audit

One row per **acronym in markable prose, per content route**, 27 of them. The population is
`CAPS_RUN` over `prose`, `standfirst` and `finding` on the three keys of `routeSections`. That is
why the same acronym appears once per route it reaches, and why acronyms occurring only in a figure
note (`EE`, `JGTRRA`, `PL`, and `FRED` on `/economy`) have no row. A note cannot carry a marker, so
this criterion never asks about it.
`test_the_criterion_four_audit_covers_every_prose_acronym` asserts this table's `(route, acronym)`
set **equals** the set `dist/` carries, so a new acronym cannot ship without a judgement and a
removed one cannot leave a stale judgement behind. The test asserts the **coverage** and never
whether the judgement is right. Reading the judgements is the Checklist item below.

`Defined` means the acronym has a glossary entry declaring it as an `abbr` and the route marks it at
its first use, so the reader gets the expansion in place, on hover and on focus. `Left as it stands`
means the reader is not owed an expansion, and the row says why.

| Route | Acronym | Judgement | Criterion 4 |
|---|---|---|---|
| /economy | `CBO` | Defined. `congressional-budget-office`, marked in §1's prose, the first of six occurrences | Pass |
| /economy | `CPI` | Defined. `consumer-price-index`, marked on `CPI-U` in §4's finding. `CPI-U` is the all-urban series; `CAPS_RUN` sees the `CPI` inside it, which is the form the entry declares | Pass |
| /economy | `FY` | Defined. `abbr` on `fiscal-year`, marked on "FY2025" in §1's standfirst, which is where a reader first meets the convention the whole site runs on | Pass |
| /economy | `GDP` | Defined. `gross-domestic-product`, marked in §1's standfirst, the site's first sentence about a number | Pass |
| /economy | `PCE` | Defined. `pce-price-index`, marked on "core PCE" in §4's prose | Pass |
| /households | `CBO` | Defined. marked in §2's standfirst, this route's first occurrence | Pass |
| /households | `FRED` | Left as it stands. a data host, not a concept. The route writes "Census/FRED" as a provenance label, and what a reader needs about it is which series it served, which `/sources` answers. Hand-named in `_INITIALISMS_WITH_NO_ENTRY` | Pass |
| /households | `FY` | Defined. marked on "FY1995" in §5's prose, where the route says out loud that its tax-year dating breaks the site's fiscal-year convention | Pass |
| /households | `GDP` | Defined. marked in §6's finding, this route's only occurrence | Pass |
| /households | `IRS` | Defined. `internal-revenue-service`, marked in §5's prose, beside the sentence about what the SOI series excludes | Pass |
| /government | `ACA` | Left as it stands. a statute's published short name, reaching prose through `pipeline/curated/laws.yaml`. Expanding it would be editing quoted material, which Criterion 7 forbids | Pass |
| /government | `AT` | Left as it stands. not an acronym. A fragment of the shouted "AT LEAST ONE" in `src/data/party_splits.json:22`, curated data owned by **#103** and carried in `KNOWN_SHOUT_DEBT` | Pass |
| /government | `CARES` | Left as it stands. a statute's published short name, as `ACA` above | Pass |
| /government | `CBO` | Defined. marked in §1's prose, the first of this route's occurrences | Pass |
| /government | `DC` | Left as it stands. a place. "28 states and DC" is the jurisdiction count, and the expansion tells a reader nothing they need | Pass |
| /government | `FY` | Defined. marked in §1's standfirst, the first of this route's 35 occurrences | Pass |
| /government | `GDP` | Defined. marked in §1's standfirst, on the toggle sentence that introduces the share-of-GDP reading | Pass |
| /government | `II` | Left as it stands. a Roman ordinal, "Trump II". Not an initialism at all | Pass |
| /government | `IRA` | Left as it stands. a statute's published short name, as `ACA` above | Pass |
| /government | `IRS` | Defined. marked in §11's prose, at the dating-exception sentence, this route's first occurrence | Pass |
| /government | `LEAST` | Left as it stands. a fragment of "AT LEAST ONE", as `AT` above. **#103** | Pass |
| /government | `OECD` | Defined. `oecd`, marked in §10's prose, immediately before the cross-country figure it introduces | Pass |
| /government | `ONE` | Left as it stands. a fragment of "AT LEAST ONE", as `AT` above. **#103** | Pass |
| /government | `UK` | Left as it stands. a place, in a list of the largest foreign holders beside Japan and China | Pass |
| /government | `US` | Left as it stands. a place, and the country this entire site is about | Pass |
| /government | `VOICE` | Left as it stands. a fragment of the shouted "VOICE VOTE" in `pipeline/curated/laws.yaml:287`, curated data owned by **#103** | Pass |
| /government | `VOTE` | Left as it stands. a fragment of "VOICE VOTE", as `VOICE` above. **#103** | Pass |

`AT`, `LEAST`, `ONE`, `VOICE` and `VOTE` are not acronyms and their rows say so. They are here
because the population is derived from `CAPS_RUN` rather than from a list of things someone already
decided were acronyms. Rule 2 requires that derivation, and it is also why a genuine new acronym
cannot enter under the same shape.

### Criterion 5 audit

One row per section on the four report routes, and the row set is asserted equal to `dist/`'s by
`test_the_criterion_five_audit_covers_every_section`. **The causal-connective inventory lands here**,
per method rule 5 and in place of the PR body the issue originally asked for. 47 connective hits
were classified section by section as *method* (a claim about the chart's construction, checkable
from the chart), *temporal* ("since 1913"), or *a claim about the world*. Only the last is a
Criterion 5 problem, and column 4 records the judgement.

Column 3 names what settles the section's claims: the figure, its `<details>` table, its note, its
source line, or a registry entry. Column 4 is the surviving interpretation and the sentence that
marks it as one, or **None** where every sentence is a statement about the data or the drawing. A
new section cannot ship without declaring both. Neither column is machine-checked, only their
coverage is, and reading a row against the page it judges is Checklist items 5 and 7.

| Route | Section id | What a reader checks its prose against | What in it is the site's reading, and where it says so | Criterion 5 |
|---|---|---|---|---|
| / | purpose-and-scope | The three routes themselves. Every subject named here is presented on a route with the evidence beside it | None. The section states scope and what falls outside it, both facts about the site rather than readings of the data | Pass |
| / | data-and-coverage | Each route's own first section, which states its span, and the six cards, each of them linked | None. The spans are read off the datasets' coverage blocks and the cards off `siteRoutes` | Pass |
| / | reading-a-figure | Any figure on the site: the apparatus described here is on all of them, in this order, and a reader can open one and check | That a single-unit view distorts is the site's reading. The section marks it by stating the arithmetic first, "the same series reads three ways" | Pass |
| / | provenance-and-method | `/sources`, which the closing sentence links, and every figure's own Source line | None. Every claim here names who published a number and when, and each is checkable on `/sources` | Pass |
| / | impartiality-and-its-limits | Government §9, whose two attributions total the same figure, and each route's own limits section | That four practices hold impartiality in place is the site's claim. The paragraph names all four, so a reader can test each one | Pass |
| / | suggested-reading-order | The three routes in the order given. The economy route's own denominators are what the claim rests on | That the economy sets the denominators is the site's reading, and it is given as the reason for the order rather than asserted | Pass |
| /economy | one-picture | `one-picture` and its table; $2.383T, $23.718T and 895% are registered in `prose_figures.yaml` | None. The closing prose is about the log axis and the fiscal-year convention, both claims about the drawing | Pass |
| /economy | growth-shadow | `growth-shadow`, its note, and the full-span table beneath it | None, and the section says so in its own sentence: "This chart shows that the two series diverged. It does not show why, and nothing here identifies a cause" | Pass |
| /economy | who-works | `who-works`, two panels with two denominators, and its note | That the noncyclical rate is CBO's estimate rather than an observation is marked in its own sentence, which also says CBO revises it | Pass |
| /economy | prices-rates | `prices-rates`, the price panel over the rate panel on the same fiscal years | That "the same shape appears in both" is a reading of two panels, and the sentence after it says "Nothing here identifies a cause", giving the narrower reason the panels are stacked at all | Pass |
| /economy | labor-capital | `labor-capital` and its note; both shares are of GDP, which the standfirst, the note and the prose each say | That the fiscal 2020 moves are denominator artefacts rather than a trend. Marked as arithmetic in its own sentence: a share's numerator can rise against a shrinking denominator without any of it being newly earned | Pass |
| /economy | limits | The five limits, each naming a series on this route | None. Every sentence states what the route cannot answer, and the last hands off to `/households` | Pass |
| /households | what-a-household-earns | `median-income` and its note; $65,380, $83,730 and 28.1% are registered | That the pre-1984 years "are not flat: they are unobserved by this particular measure" is a statement about the measure, and it is written as one | Pass |
| /households | the-spread | `the-spread`, whose table carries the Gini series and both CBO anchor points, and its note | None, and the section says so: the two measures are "shown on one timeline without a causal claim attached", with nothing connecting the distribution to any particular policy | Pass |
| /households | a-century-of-brackets | `bracket-history`, whose table carries the bracket count, the top rate and the threshold in nominal and constant 2024 dollars, with a documented reason for each of the twelve divergent years | That the bracket count is a policy choice and the threshold erodes unless re-indexed is a mechanism, and both halves are checkable in the table's own columns. The ordinary-income scope is stated in its own paragraph | Pass |
| /households | statutory-vs-effective | `statutory-vs-effective`; CBO's five published anchor years, which the note says are never drawn as a line | None. The lowest quintile's fall from 9.3% to 0.6% is stated as the two anchor points, followed by the sentence saying the anchor years establish the fall and not what produced it | Pass |
| /households | who-pays | `who-pays` and `top1-share`, both from the IRS table, and the two notes | That "the tax-share column alone misleads about who pays the most versus who earns the most" is a reading about how the chart is misread. The page marks it by giving both columns in the same sentence, so a reader can disagree from the figure | Pass |
| /households | the-bill-you-do-not-see | `payroll-bill` and its note, which states the fiscal-year break and the wage cap | That the payroll bill is larger for every household outside the top decile is an incidence claim beyond this chart's aggregate shares. The paragraph marks it by saying the two charts answer different questions about the same taxpayer, and neither is the whole federal bill | Pass |
| /households | limits | The five numbered limits, each naming its section and its source | None. Each limit states a scope or a dating fact, including that this route breaks the site's own FY convention | Pass |
| /government | forty-trillion | `debt` in both units; $19.57T and the $40T crossing are registered, and the note says the final point is a daily close | That "what changed is the base" is a reading, marked by giving its arithmetic in the same paragraph: $10.2 trillion added over the earlier decade against $20.3 trillion over this one | Pass |
| /government | who-holds-it | `debt-holders`, whose note redoes the 30%-of-public against 24%-of-gross arithmetic in full; the Japan, UK and China holdings are registered to the TIC release | The foreign share. The prose states what the snapshot is (who holds the paper, counting no payments), says it settles nothing about solvency, and names reading a rising foreign share as a constraint as an interpretation the chart does not carry | Pass |
| /government | how-old | `debt-maturity`: 71 months average, roughly a third inside twelve months, with the note naming the instruments it omits | That a short average maturity is a repricing schedule is a claim about how Treasury debt is issued, not about the interest series. The paragraph marks the boundary by saying this section does not measure what the repricing cost, and pointing at section 7 for that | Pass |
| /government | whole-budget | `whole-budget`, whose two panels carry outlays, revenue and the deficit, and its note on offsetting receipts | None. The closing prose is about the drawing: the two panels are the same arithmetic seen twice | Pass |
| /government | structural-gap | `structural-gap`; the 17.2% and 21.1% averages are registered | That the gap is "structural rather than circumstantial" is a reading, and it is marked by carrying its own test in the same sentence: it shows up in years with no recession and no major tax bill, and the four years it closed are named | Pass |
| /government | what-congress-votes-on | `voted-and-not` and its table, which carries the whole series behind the two endpoints | That "the endpoints hide the trajectory" is a reading of the chart, and the sentence gives the intermediate value it turns on: 1.2% of GDP in 2015, nearly tripled since | Pass |
| /government | net-interest | `net-interest`; $232B, $970B, the $9.4T total and the 39% are registered | None. The 39% is stated as a ratio of two totals, with the sentence after it saying it is not an earmark and that no borrowed dollar is assigned to interest | Pass |
| /government | the-laws | `law-explorer`, whose table carries each law's score, date and per-party roll call, with the † and ‡ footnotes for the two unscored laws and the voice vote | The 10% cross-party threshold, marked in its own sentence: "This threshold is a judgement, stated here so it can be disagreed with." The $16.75T-against-$24.15T gap names what moves a deficit without a roll call and then says which of them accounts for how much is not something this route measures | Pass |
| /government | passed-signed | `attribution`, whose table carries both columns and both totals, and its note on net against gross | That colouring by control credits or blames one party for laws the other largely voted for is a reading, and it is marked by naming the two roll calls it turns on, 71-28 and 67-28 | Pass |
| /government | where-money-comes-from | `revenue` and `oecd`, with the note saying the OECD figure counts all three levels of government and the federal figure does not | That the US having no value-added tax explains the OECD gap is the claim this section refuses: the prose says how much of the gap that absence explains is not something the comparison settles, because it ranks totals and does not decompose them | Pass |
| /government | by-state | `state-give-get` and `state-tax-mix`, with the note defining give as gross IRS collections by filer address and get as USASpending award spending by place of performance | The whole section is the marking. Three paragraphs state what it is not (a balance of payments), that where a dollar is booked is not where it lands, and that neither side is complete, ending on "Read the ordering, not the arithmetic" | Pass |
| /government | limits | The six limits, each naming the charts it bounds and the convention it breaks | Limit 1 is the route's own refusal of causation: "Every chart here records who was in office, not who caused what." Limit 2's "unprecedented" names the distortion nominal dollars produce, not the subject, and the sentence gives the arithmetic that makes it a distortion | Pass |

### Criterion 6 audit

One row per section on the four report routes, and the row set is asserted equal to `dist/`'s by
`test_the_criterion_six_audit_covers_every_section`. **The coverage count lands here**, per method
rule 5 and in place of the link quota Criterion 6 refuses. Six of the 29 named a destination in
their closing prose before #61, nine did anywhere in the section, and the remaining 20 are recorded
here one by one.

Column 3 is a reading. **"Ends here, and correctly" is a legal and expected answer**, and it is the
answer for most of the 20. A construction caveat that bounds the chart above has closed its
section's question, and manufacturing a link out of it is the dishonest transition the refused quota
would have produced. The test asserts **coverage** and never the wording. Reading a row against the
page it judges is Checklist item 14.

| Route | Section id | Where it hands the reader next, or why it ends here | Criterion 6 |
|---|---|---|---|
| / | purpose-and-scope | Ends here, and correctly. It states the scope and what falls outside it, and naming the destinations is the next section's job | Pass |
| / | data-and-coverage | To all six destinations, as the card list under the prose. The links are `<h3><a>` inside `ol.cards`, so they carry no prose class and stay outside the in-prose cross-reference check | Pass |
| / | reading-a-figure | Ends here, and correctly. The section is an apparatus lesson, and its destination is every figure on the site rather than any one section | Pass |
| / | provenance-and-method | To `/sources`, named and linked in the closing sentence, where the register the section describes actually lives | Pass |
| / | impartiality-and-its-limits | Ends here, and correctly. It closes on the design brief's own sentence, which is the claim the section exists to state | Pass |
| / | suggested-reading-order | To `/economy`, linked in the opening sentence. This is the front door's first forward hand-off, and the reason the order is given at all | Pass |
| /economy | one-picture | Ends here. The closing prose is the fiscal-year convention and the log axis, construction caveats bounding the chart above. It names the government route as the holder of the same denominator without linking it, which is a boundary rather than a hand-off | Pass |
| /economy | growth-shadow | Ends here, and correctly. The closing sentence is the route's refusal of causation, "It does not show why, and nothing here identifies a cause", which is a boundary and not a stop | Pass |
| /economy | who-works | Ends here. A fiscal-year averaging caveat and two axis decisions, bounding the two panels above | Pass |
| /economy | prices-rates | Forward to `/government` twice and by anchor: `#net-interest` for what repricing costs, `#how-old` for how fast it feeds through. The earliest cross-route hand-off on the site, and the register the two written by #61 follow | Pass |
| /economy | labor-capital | Ends here. The closing prose is the fiscal 2020 denominator artefact, arithmetic bounding the two shares above | Pass |
| /economy | limits | Forward to `/households`: the ladder's first joint, an unnumbered `.prose` after the numbered limits naming the three things the next route delivers | Pass |
| /households | what-a-household-earns | Forward to the next section by name. The family Gini index "in the next section" runs back to 1947, which is the reason this series starts in 1984 | Pass |
| /households | the-spread | Ends here, and correctly. The closing sentence refuses the causal claim two series on one timeline invite | Pass |
| /households | a-century-of-brackets | Ends here. A scope caveat: ordinary income only, plus the surtax exception that makes three years read higher than the plain schedule | Pass |
| /households | statutory-vs-effective | Ends here. The closing prose restates the gap between the two lines as the section's point and bounds it with the anchor-year caveat | Pass |
| /households | who-pays | Back to `#the-spread` by anchor, in the prose above the closing paragraph. The closing prose itself is a dating and refundable-credit caveat, and correctly ends there | Pass |
| /households | the-bill-you-do-not-see | Back to Section 5 by name, reconciling the two charts rather than leaving them in apparent conflict. Ends on the reading, not on a caveat | Pass |
| /households | limits | Forward to `/government`: the ladder's second joint, written by #61. An unnumbered `.prose` after limit 5, in the shape `/economy` §6 uses so it cannot read as a sixth limit, naming three things the next route delivers (§10's revenue mix, §4's budget, §7's interest bill) and linking §10 by anchor | Pass |
| /government | forty-trillion | Ends here. The closing prose is the CBO projection the series overtook by two years, a dating fact bounding the chart | Pass |
| /government | who-holds-it | Ends here. The closing sentence bounds the intragovernmental share, which is the misreading this chart invites | Pass |
| /government | how-old | Forward to `#net-interest` by anchor and by name, after saying outright that this section does not measure what the repricing cost | Pass |
| /government | whole-budget | Forward to `#structural-gap` by anchor and by name, written by #61. The closing prose names the question this section does not ask and says which section asks it | Pass |
| /government | structural-gap | Ends here, and correctly. The closing sentence is the structural-versus-circumstantial test and the four years the gap closed. Its standfirst, rewritten by #61, links back to `#whole-budget` instead of restating what §4 had just drawn | Pass |
| /government | what-congress-votes-on | Ends here. The closing prose is the endpoints-hide-the-trajectory reading of the chart above | Pass |
| /government | net-interest | Back to `#how-old` by anchor, closing the ring §3 opened, after the trough-is-not-the-low caveat | Pass |
| /government | the-laws | Ends here, and correctly. The closing sentences name what a table of scored laws cannot reach and say the decomposition is not something this route measures | Pass |
| /government | passed-signed | Ends here. The closing prose is the attribution caveat with its two roll calls: the reading the colouring invites, and this section's refusal of it | Pass |
| /government | where-money-comes-from | Ends here, naming `/households` as the owner of the tax-year-2023 figure it does not draw, without linking it. A boundary rather than a hand-off, and correctly so: a reader arriving in route order has come from there | Pass |
| /government | by-state | Back to `#limits` by anchor, in the prose above. The closing prose is the three-vintage caveat and the territory exclusion, and correctly ends there | Pass |
| /government | limits | Forward to `/economy` and `/households`, and out to `/sources`. Written by #61: the site's last paragraph now says what the three routes draw together and links two of them, over and above the Sources line it already carried | Pass |

## Checklist: status per item

This section holds what only a human reader can judge. Every item is **NOT EXECUTED** on landing,
which is a statement about this contract's coverage rather than a formality. Nothing below is
enforced by `pipeline/tests/test_prose.py`, and no agent in this loop has read the site as a
reader.

1. **Read each route end to end, once, without stopping to check anything.** Does the argument hold
   together, and does each section earn the next? #61 made as much of this mechanical as it goes and
   no further. The three link checks under the `# 11.` banner see that a cross-reference **exists**
   and that it **resolves**. Every in-prose href is base-aware and lands on an id that exists, both
   joints of the route ladder are written in prose rather than only in the rail, and the site's last
   paragraph points at something other than the reference pages. **None of them reads the sentence
   around the link.** A paragraph that stops dead and then appends "See also: the government route"
   satisfies all three; so does a section whose closing caveat hands the reader on perfectly and
   happens to name no anchor. Neither the coverage count in the Criterion 6 audit nor a passing
   `pytest` is this reading. **NOT EXECUTED.** Human required. Criterion 1 and Criterion 6.
2. **For each figure, read the standfirst, then the chart, then the finding, in that order.** Does
   the finding say something the chart shows, and could a reader disagree with it from the chart
   alone? **NOT EXECUTED.** Human required. Criterion 2.
3. **Read every `.finding` against its chart `aria-label`.** They are meant to be the same sentence.
   Divergence is invisible to `test_every_chart_svg_states_a_finding`, which checks the label's shape
   and not its agreement with the finding beside it. **NOT EXECUTED.** Human required. Criterion 7.
4. **Read the site as someone who does not know the vocabulary.** Which terms are used before they
   are defined, and which glossary entries are never reached from prose? #59 made the ordering
   mechanical, because `test_every_marked_term_sits_at_its_first_use` asserts no marked term's
   surface form appears earlier than its marker, with no baseline. #59 left the half a matcher
   cannot reach. **Which sense of a word is on the page is a reading.** `/government` §2 said "the
   intragovernmental piece is real money owed to future retirees", where "real" is the everyday
   adjective and marking it would have pointed the reader at the economic term, which is the
   opposite of defining it. That sentence was reworded rather than exempted, and nothing stops the
   next one. No word list is invented to fake this, because a proxy would report green on exactly
   the sentence it misreads. **NOT EXECUTED.** Human required. Criterion 4.
5. **Check every causal-sounding sentence against what the data can support.** "Rose while" is a
   claim about a series; "rose because" is a claim about the world. #60 made this as mechanical as
   it goes and no further. The two checks under the `# 10.` banner see the registry and the audit
   table's coverage; **neither reads a sentence.** A figure can sit inside a paragraph that
   misdescribes it and pass `test_every_registered_prose_figure_still_appears_in_the_prose`, and a
   section can declare "None" in the audit's interpretation column while its prose quietly draws a
   cause. **Three word lists were measured against the built site and all three were rejected**, and
   the numbers are in Criterion 5 above: a causal-connective list at 47 hits was 96% legitimate and
   found only 2 of the 5 sites this issue existed to fix, because three of the five drew a cause with
   no connective in them at all; a 24-word hype list scored zero on 22 of its words, and its two
   survivors are exemptions it would have to name; a number-without-its-unit detector cannot separate
   the 816 unclassified numbers without a hand-kept vocabulary. Each would have reported green on
   exactly the sentences a reader stumbles over. **NOT EXECUTED.** Human required. Criterion 5.
6. **Check sentence rhythm out loud**, which is the only reliable test for the long clause-stacked
   sentence the dash was hiding. A dash removed and replaced with a comma pair sometimes reveals a
   sentence that should have been two. **NOT EXECUTED.** Human required. Criterion 3.
7. **Read the figure notes as a sceptical reader**, asking of each one whether it tells the reader
   what the chart cannot do or merely restates what it does. Nothing reaches this. A `.figure-caveat`
   is inside `PROSE_CLASSES`, so it is held to the punctuation, emphasis and sentence-length rules
   and to Criterion 5's registry check, and to nothing else. **No test compares a note to the chart
   above it**, which is where a restating note and a bounding note look identical. `/government` §2's
   note redoes the 30%-of-public against 24%-of-gross arithmetic and bounds the chart, while a note
   that only repeats the finding would pass every assertion in `test_prose.py`. The audit table's
   column 3 records which artefact settles each section's claims, and a note is often that artefact;
   whether it earns the description is this reading. **NOT EXECUTED.** Human required.
   Criterion 5.
8. **Read each section in the order standfirst, chart, closing prose.** Does the standfirst pose a
   question a reader could have asked, does the closing prose answer that question rather than
   describe the chart again, and does the heading name a question or a claim rather than the
   section's variables? The last of the three is the half no word list reaches. A heading naming
   what was plotted passes `test_no_section_heading_names_the_charts_construction` and fails this
   criterion on any human reading. **NOT EXECUTED.** Human required. Criterion 1.
9. **Read each standfirst and its finding as a pair, and ask two questions of them.** Of the
   standfirst, does it name what is plotted, against what, over what window, and what the reader
   should look at? Of the finding, is it one claim, or several joined by a full stop? The mechanical
   half of Criterion 2 measures shared number tokens and character counts, which is why
   `households#who-pays` was catchable and why a standfirst that restates its finding in words
   would not be. Neither number is the judgement. **NOT EXECUTED.** Human required. Criterion 2.
10. **Decide, clause by clause, which clauses are essential and which are not**, in the sense
    OpenStax *Writing Guide* 8.6 uses, and check that the punctuation follows the decision.
    Ruling 1's replacement table is the mechanical half, and it says what to write once you know
    which job the dash was doing. Knowing which job it was doing is a reading, and so is deciding whether
    a clause a comma pair now sets off was ever nonessential. **No word list is invented to make
    this look mechanical**, because a proxy for it would report green on exactly the sentences a
    reader stumbles over. `test_no_prose_sentence_runs_past_the_cap` measures length, which is a
    proxy for clause load and nothing more. **NOT EXECUTED.** Human required. Criterion 3.
11. **Read the seven split sentences aloud and confirm each still claims what it claimed.** #58
    split seven sentences that ran past 45 words, on `/`, `/economy` and `/government`. A split is
    allowed to move a pause; it is not allowed to move a figure, drop a qualifier onto the wrong
    clause, or turn a hedged claim into a flat one. Every figure in those sentences is registered
    in `pipeline/curated/prose_figures.yaml`, and the drift report checks the *number*, never the
    sentence around it. **NOT EXECUTED.** Human required. Criterion 3 and Criterion 7.
12. **Read `/contents`' standfirst in the browser, not in the source.**
    `test_no_prose_string_fuses_two_words_at_a_component_boundary` cannot see the
    expression-boundary form of the word-join it exists to catch, because an interpolated count is
    indistinguishable from literal text once rendered. The standfirst carries four such
    boundaries, it served "6 destinations,25 numbered figures" before #58, and the fix is a `{' '}`
    that only a rendered read can confirm is still there. **NOT EXECUTED.** Human required.
    Criterion 3.
13. **Read every row of the Criterion 4 audit against the page it judges, and read every gloss
    against the figure note on the same section.** Two readings, one item, because both are the
    same question asked of a definition. Does the definition agree with what the page beside it
    says? The audit
    table's coverage is asserted; whether "left as it stands" is the right call for `DC` on
    `/government` §10, or whether marking `CPI` inside `CPI-U` reads correctly in a finding a
    screen reader also speaks, is a judgement a reviewer writes and nothing checks. And a glossary
    `short` is rendered inside a paragraph by `<Term>`, a `<Figure note>` is rendered under the
    chart in the same section, and **no test compares them**. A gloss that says a series is
    fiscal-year while the note beside it says calendar-year would pass every assertion in
    `test_prose.py`. That comparison is #59's sixth definition-of-done item, and it is human-judged
    by method rule 4 rather than proxied. **NOT EXECUTED.** Human required. Criterion 4 and Criterion 7.

14. **Read each route end to end again, this time stopping at every boundary**, and ask two
    questions. At each of the 31 section boundaries, does the closing sentence hand the reader on, or
    does it merely stop? At the two route boundaries, `/economy` to `/households` and
    `/households` to `/government`: does the sentence carrying the link name what the next route
    actually delivers? The second question is the one that matters most and the one nothing can be
    built to answer, because **a transition that promises something the target section does not
    deliver is worse than no transition**. Such a transition resolves, it passes
    `test_every_in_prose_cross_reference_resolves_and_is_base_aware`, and it lies. Every forward
    reference #61 wrote was read against the target section's content before it was written, and
    that reading is recorded in the Criterion 6 audit's column 3; whether the reading is **right**
    is this item. **No word list of any kind was added.** A transition-word list, a link quota and a
    closing-prose word floor were each measured against the built site and each rejected on its
    number, and the three numbers are in Criterion 6 above: the list scores zero on all four of the
    hand-offs the site already writes well, the quota would manufacture 20 links with nowhere
    honest to point, and the floor would fire only on the one sentence the issue was rewriting
    anyway. **NOT EXECUTED.** Human required. Criterion 6.
