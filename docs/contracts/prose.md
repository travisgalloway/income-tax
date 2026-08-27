# Contract: prose (`docs/contracts/prose.md`)

Prose was the only part of this site with no contract. `docs/contracts/accessibility.md` governs the
charts, `docs/contracts/interfaces/` holds fifteen data contracts, and the words had one rule
(`BRIEF.md:78`, "Never use em dashes in prose") that was broken on every route, banned a character
without naming a replacement, and had nothing behind it.

This contract has three parts, in the shape `docs/contracts/accessibility.md` uses. **Conventions**
are the rules, each with a worked pass and a worked fail at a real line, each naming the test that
enforces it or saying plainly that none does. The **Rubric** is seven numbered criteria adapted from
OpenStax *Writing Guide* 8.7, one per craft dimension, each naming the issue that cites it. The
**Checklist** is what only a human reader can judge, and every item on it is marked NOT EXECUTED
today.

**What is enforced and what is not.** Punctuation and emphasis are mechanically checkable, and
`pipeline/tests/test_prose.py` fails the build on them. Everything else here, which is most of it, is
human judgement: whether a section states its question before its first figure, whether a finding is
falsifiable against the chart beside it, whether a term is defined the first time a reader meets it.
Those are the rubric's business, and the rubric is read by a person. This document does not dress
judgement up as automation.

**The check reads `dist/`, not `src/`.** A scan of the page sources counts `---` frontmatter comments
and developer-facing `throw` strings as prose, none of which a reader ever meets, and misses the
strings the islands assemble at runtime, which a reader does meet. It is also an allow-list over four
named classes and three named kinds of accessible name, never a deny-list. Both choices are argued in
`pipeline/tests/test_prose.py`'s module docstring and again under **Scope** below.

**Today's violations are enumerated, not exempted.** `KNOWN_DASH_DEBT` and `KNOWN_SHOUT_DEBT` in
`pipeline/tests/test_prose.py` list every one, each mapped to the issue that owns its removal, and
both are asserted with `==`. A new violation fails the build on the new fingerprint; *fixing* one
fails the build on the missing entry. The baseline can only shrink, deliberately, in the same commit
as the fix. Zero is #58's definition of done, plus #102 and #103 for the two surfaces no prose edit
can reach.

This document follows its own rules. That is the cheapest available demonstration that the
replacements work, and quoted fail examples are the only em dashes in it.

## Genre

The genre is the **analytical report**: OpenStax *Writing Guide* 8.3, "Glance at Genre: Informal and
Formal Analytical Reports". Its defining move is that a claim arrives with the evidence a reader
needs to check it, and that the writer's job is to make the checking easy rather than to make the
claim persuasive. Every rule below is downstream of that.

The register is fixed and predates this contract. `sections.md:9-10` states it, and it survives here
verbatim:

> Register: plain, direct, figures always with units. No em dashes. Never assert causation the data
> does not support.

`BRIEF.md:193-199` adds the hype ban: do not write "shocking," "staggering," or "crisis."

## Scope

Stated once here, implemented once in `pipeline/tests/test_prose.py`, and used by every mechanical
rule below.

A **prose element** is an element carrying one of four classes: `prose`, `standfirst`, `finding`,
`figure-caveat`. A **prose string** is a prose element's text, or one of three kinds of accessible
name: the `aria-label` of a `figure.figure`, the `aria-label` of an `svg.chart`, or the `aria-label`
of a `role="img"` element inside an `svg.chart`, which is a per-datum readout assembled at runtime.

Nothing else is a prose string. In particular:

- **`<span class="unit">—</span>` is not prose.** In a built table it means "this column has no
  unit". It is typographic, and `.unit` is outside the allow-list, so it needs no exemption. Do not
  add one.
- **The `Source.` span is not prose.** `src/components/Figure.astro:61` renders `fig.sourceLine`
  verbatim, and `src/components/Figure.astro:45-46` makes a missing one a build failure. It carries
  no class, and `.figure-caveat` at `src/components/Figure.astro:60` is its *sibling*, not its
  ancestor, so the check never visits it. See **Drift and quoted material**.
- **A glossary popover body is not this page's prose.** `src/components/Term.astro` renders the
  term's `short` into a `.term-pop` inside the paragraph. It is reader-visible, but it is an entry
  under `src/content/glossary/` with its own editing surface and its own owner, #59. The extractor
  does not descend into `.term-pop`.
- **Control names are not prose.** A `nav` name, a `role="radiogroup"` name, a `role="tablist"` name
  and a `role="list"` name are governed by `docs/contracts/accessibility.md`, not by this contract.

## Conventions

**No em dash, and no ` -- ` either.** The ban stands (Ruling 1), and every job an em dash was doing
has a named replacement. Fail: `src/pages/economy/index.astro:288` reads "Every series on this route
— GDP, prices, rates, the wage and profit shares — is one number"; the aside is itself a list, so it
takes parentheses. Fail: `src/pages/households/index.astro:144-145` reads "what people actually pay
-- the average federal tax rate -- has moved far less"; an appositive gloss takes a comma pair. Pass:
`src/pages/government/index.astro:272-275`, which does the same work with a full stop and a new
sentence. Enforced by `test_no_prose_string_contains_an_em_dash_or_a_double_hyphen`.

**No all-caps emphasis.** Capitals are the `.kicker`'s role and nothing else's (Ruling 2). Fail:
`src/pages/households/index.astro:121`, "The bracket COUNT is a policy choice". Fail:
`src/pages/households/index.astro:133`, "Surtaxes ARE folded into the published top rate". Fail, in a
figure note, `src/pages/households/index.astro:159`, "it INCLUDES PAYROLL TAX". Pass:
`src/pages/government/index.astro:443` and `src/pages/government/index.astro:450`, which put the
emphasis on a `<strong>` noun phrase, and `src/pages/households/index.astro:261`, which does the same
for a numbered limit. Enforced by `test_no_prose_string_shouts`.

**Acronyms are registered, not assumed.** An all-caps run of two or more letters is either in
`REGISTERED_INITIALISMS` in `pipeline/tests/test_prose.py` or it is a shout. Pass: "GDP", "CBO",
"OECD", and "PL 115-97" in the vote-splits note sourced from `src/data/party_splits.json:4`. A
CamelCase word is not a run: "USASpending" and "HSall_members.csv" are matched as words, not as
capitals. Adding an acronym means
adding it to the set with a comment saying what it stands for, which is a deliberate act and leaves a
diff. Enforced by `test_no_prose_string_shouts`.

**Body copy is sentence case.** `BRIEF.md:77`. The kicker is not an exception, because it is not
literal capitals: `src/styles/global.css:60-66` sets `font-variant-caps: all-small-caps` with
`letter-spacing: 0.09em` at `0.9375rem`, and no `text-transform`. Pass:
`src/pages/economy/index.astro:115` writes `<span class="section-no">Section 3</span>`, in sentence
case, and the CSS does the rest. There is therefore no kicker carve-out anywhere in this contract.
Enforced, for the capitals half, by `test_no_prose_string_shouts`.

**Numbers are always mono, and a sentence may open with one.** `BRIEF.md:74` makes mono numerals the
strongest cue tying the site to the deck. Sentence case and that mandate collide where prose opens
with a figure, and the ruling is that the numeral wins. Pass:
`src/pages/economy/index.astro:32-35`, "Real GDP was $2.38 trillion in fiscal 1950". Fail: spelling
the figure out, because `pipeline/curated/prose_figures.yaml` is watching that number and a spelled
form detaches the registry from the prose it describes. Not mechanically enforced.

**Every figure carries its unit.** `sections.md:9-10`. Pass: `src/pages/economy/index.astro:118`,
"Unemployment was 4.2% in fiscal 2025 against a noncyclical rate of 4.4%". Fail: any bare "4.2" in
running prose. Not mechanically enforced here; the *figure*'s axes are separately gated by
`src/components/Figure.astro:47`, which fails the build when either axis is unnamed.

**No causation the data does not support.** `BRIEF.md:197-198`. Pass:
`src/pages/economy/index.astro:108-111`, which states what a series shows and then says outright that
nothing here identifies a cause. Fail: any sentence in which one series "drove", "caused" or "led to"
another. Not mechanically enforced. Criterion 5 is where a reviewer catches it.

**No hype vocabulary.** `BRIEF.md:199` names three words: "shocking", "staggering", "crisis". The
rule is broader than the list, and the list is the floor. Not mechanically enforced.

**A finding states one claim a reader could falsify against the figure.** Pass:
`src/pages/economy/index.astro:121-124`, which gives the unrounded values, both series and the
comparison between them, in two sentences. Fail: a finding that restates the standfirst, or that
makes two claims joined by "and". Not mechanically enforced. Criterion 2 owns it.

**A chart's `aria-label` is prose, and it is the finding.** The `<figure>`'s name and the `<svg>`'s
name are deliberately the same sentence per `docs/contracts/accessibility.md`, so a convention that
moves one must move both, in the same commit. The label is additionally bound by
`pipeline/tests/test_accessibility.py:283-300`: a digit, at least 40 characters, no leading shape
word, and never "chart showing". Pass: `src/pages/economy/index.astro:127`. Fail:
`src/components/islands/StatutoryVsEffective.tsx:97`, which is a ` -- ` violation *inside* an
accessible name, and is the reason `dist/households/index.html` carries more banned dashes than its
page source does. Enforced by `test_no_prose_string_contains_an_em_dash_or_a_double_hyphen` and, for
the accessibility half, by `test_every_chart_svg_states_a_finding`.

**A cited line resolves.** Every `path:line` in this document points at a file that exists with at
least that many lines, and every path is repository-relative. Enforced by
`test_prose_contract_cites_lines_that_resolve`, which is the check that stops this contract rotting
the way the seven checks removed on 2026-08-26 had rotted.

## Rulings

### Ruling 1 — the em dash ban stands, and the prose is wrong

**The ban stands**, because a dash set against the site's mandatory mono figures (`BRIEF.md:74`)
reads as a minus sign on pages full of deficits and negative rates, because OpenStax *Writing Guide*
8.6 supplies a comma-based alternative for every job these dashes are doing, and because repealing it
would bless three incompatible conventions rather than replace them with one.

`BRIEF.md:78` banned the character and named no replacement, which is why the ban was ignored. One
replacement per grammatical job, so remediation is a mechanical pass and not thirty-seven judgements:

| Job | Live example | Replacement |
|---|---|---|
| parenthetical aside | `src/pages/economy/index.astro:288` | comma pair; parentheses where the aside is itself a list, as it is there |
| amplifying clause | `src/pages/government/index.astro:424` | colon, or a full stop and a new sentence |
| appositive gloss | `src/pages/households/index.astro:144-145` | comma pair |
| generated readout separator | `src/components/islands/BudgetChart.tsx:84` | full stop. The readout's other fields are already separated by ". ", so one template edit clears all 31 labels |

Four scoping decisions, each stated so that no future issue has to litigate a grep:

1. **` -- ` is retired outright.** No ASCII stand-in is blessed. It is not an em dash and it is not a
   substitute for one: it renders as two literal hyphens, which is what a reader sees at every
   viewport. Ten instances reach `dist/`, all on `/households`.
2. **Numeric-range hyphens are out of scope.** "1946-1950" at
   `src/pages/households/index.astro:115`, "FY1995-FY2025" throughout: a hyphen between two numbers
   is a range operator, not punctuation. **No en dash is introduced in its place.** The minus-sign
   ambiguity that justifies the em-dash ban applies to the en dash identically, so this site uses the
   hyphen and only the hyphen.
3. **Island-generated strings are in scope.** Anything a reader can read or hear is prose, including
   a string assembled at runtime. `src/components/islands/StatutoryVsEffective.tsx:97` is the proof:
   a banned construction inside an accessible name, which `docs/contracts/accessibility.md` also
   governs. Owner: **#102**, together with `src/components/islands/BudgetChart.tsx:84`.
4. **Curated pipeline data is out of scope for the dash and capitals rules, by name.**
   `pipeline/curated/laws.yaml:287` carries "VOICE VOTE" and `src/data/party_splits.json:22` carries
   "AT LEAST ONE". Both are authored by this repository but reach the page through generated JSON, so
   editing them means regenerating data and re-running validation: a pipeline change with its own
   gates, not a prose edit. They are exempted by an **enumerated named set** in
   `pipeline/tests/test_prose.py`, never by a weakened assertion, and the exemption carries the issue
   that retires it: **#103**.

### Ruling 2 — shouted capitals

**All-caps is reserved for the `.kicker` role and banned in body copy and figure notes.** The
replacement is `<strong>` on the load-bearing noun phrase, which the pages already do well at
`src/pages/government/index.astro:443`, `src/pages/government/index.astro:450` and
`src/pages/households/index.astro:261`, or a recast that puts the emphasis where the word order puts
it.

Two refinements:

- **The kicker is not literal capitals**, so there is no carve-out. `src/styles/global.css:60-66` is
  `font-variant-caps: all-small-caps`; kicker source text is sentence case
  (`src/pages/economy/index.astro:115`) and passes the same mechanical check as body copy. The rule
  is uniform across every prose class.
- **Figure notes are ruled in, explicitly.** `src/components/Figure.astro:60` renders a `note` into
  the figcaption as `.figure-caveat`, and `.figure-caveat` is inside the allow-list. Without this,
  `src/pages/households/index.astro:159`'s "it INCLUDES PAYROLL TAX" would stay legal. All three
  shouts, `src/pages/households/index.astro:121`, `:133` and `:159`, are assigned to **#58** as one
  pass: splitting a three-instance fix across issues costs more than it documents.

The rule is about emphasis, not about acronyms. A registered initialism is not a shout, and the
register lives in `REGISTERED_INITIALISMS` in `pipeline/tests/test_prose.py`.

### Ruling 3 — `sections.md` is retired as an editing surface, and the file stays

**The three route pages are canonical prose.** `src/pages/economy/index.astro`,
`src/pages/government/index.astro` and `src/pages/households/index.astro` are where prose is written
and corrected. `sections.md` is not.

Reasoning, recorded so it is not relitigated. A second copy of the prose is a drift surface for the
same reason `docs/contracts/interfaces/content-sources.md` forbids a second prose copy of the source
list. `pipeline/curated/prose_figures.yaml` already registers sections E1 through E6 for Economy
sections the deck never contained. And the deck's own header at `sections.md:3` says "Eleven
sections" while the file holds twelve.

**"Retired as an editing surface" is not "deleted", and the distinction is load-bearing.** Eight
cases in `pipeline/tests/test_pipeline.py` are anchored on it, at `pipeline/tests/test_pipeline.py:236`,
`:254`, `:265`, `:457`, `:794`, `:1072`, `:1102` and `:1252`, and `pipeline/lib/validate.py` cites it
in five assertion messages. Deleting it breaks the pipeline suite, which no prose issue owns. The
ruling is: **nothing edits `sections.md` again; new and corrected prose lands in the route pages
only; the file is a frozen historical record until a follow-on migrates those tests off it.**

Consequences, recorded here with the change deferred to that follow-on:

- `pipeline/lib/report.py:135` describes drift as being in "`content/sections.md`". Two errors in one
  string: the deck is no longer the origin of quoted prose, and the path has been wrong since before
  #41 moved the file list, because the file is at the repository root and always was.
  `pipeline/lib/report.py:3` names the file correctly and is only wrong about the origin.
- `pipeline/curated/prose_figures.yaml:3` says the same thing in its `_comment`.
- `BRIEF.md:144` and `BRIEF.md:193` also say `content/sections.md`. They are not fixed by #51, which
  is capped at one line of `BRIEF.md` and spends it on `BRIEF.md:77-78`. Parked in
  `docs/parked-findings.md`.
- The register line at `sections.md:9-10` survives verbatim in **Genre** above, which is the whole
  reason retiring the deck is safe.
- #31 is closed and never modified `sections.md`, so the ordering question #51's body raised is moot
  rather than deferred.

## Drift and quoted material

**No prose edit may move a number registered in `pipeline/curated/prose_figures.yaml`.** Rewording
*around* a figure is a prose change. Restating the figure is a data change wearing a prose change's
clothes, and it is out of scope for every C-issue. The drift report
(`pipeline/lib/report.py`) compares the registry against the data and reports editorially rather than
auto-correcting, so a prose edit that moves a number leaves the registry silently describing
something that is no longer on the page.

**Prose may round, and harmonising precision is not a prose fix.** `src/pages/economy/index.astro:118`
gives "4.2%" and `src/pages/economy/index.astro:122` gives "4.175%", the value the registry holds.
That is correct: the standfirst reads and the finding checks. The rule is that the registered value
must appear at least once in its section, not that every mention matches it. A precision convention
would detach the registry from the prose it describes, which is the failure this section exists to
prevent.

**A sentence may open with a numeral.** See the conventions above. Spelling a registered figure out
trades a typographic preference for a data-integrity hazard.

**`_meta.source` is quoted material and no prose rule may edit it.** It is rendered verbatim at
`src/components/Figure.astro:61` and required at `src/components/Figure.astro:45-46`. It is also
outside the check's allow-list by construction, because the span carries no class and
`.figure-caveat` is its sibling rather than its ancestor. That is deliberate: a deny-list check would
have needed a class added to `src/components/Figure.astro` purely to express the exemption.

**A `.finding` and its chart `aria-label` move together.** They are deliberately the same sentence
per `docs/contracts/accessibility.md`. A C-issue that edits a finding and not its label breaks the
accessibility contract silently, and the label must still satisfy
`pipeline/tests/test_accessibility.py:283-300` afterwards: a digit, at least 40 characters, no
leading shape word.

## Rubric

Seven criteria, adapted from OpenStax *Writing Guide* 8.7, "Evaluation: Reviewing the Final Draft".
One per craft dimension. A C-issue cites **one** criterion by number and stops reading; that is what
the numbering is for.

### Criterion 1 — the question comes first

**Asks:** does the section state the question it answers before its first figure appears?
**Pass:** the kicker, heading and standfirst together name a question a reader could have asked, and
the chart then answers it. **Fail:** the standfirst summarises the chart the reader has not seen yet,
so the figure arrives as evidence for a claim rather than as an answer to a question.
**Cited by #52.**

### Criterion 2 — the standfirst sets up, the finding claims

**Asks:** does the standfirst set the chart up, and does the finding state exactly one claim a reader
could falsify against the figure? **Pass:** `src/pages/economy/index.astro:117-124`, where the
standfirst rounds and orients and the finding gives the unrounded values and the comparison between
them. **Fail:** a finding that restates the standfirst, or that joins two claims with "and". Bound by
the pairing rule in **Drift and quoted material**: a finding edit moves the matching `aria-label` in
the same commit, and the label stays inside `pipeline/tests/test_accessibility.py:283-300`.
**Cited by #53.**

### Criterion 3 — sentence craft

**Asks:** sentence length, clause count, punctuation (Ruling 1) and emphasis (Ruling 2).
**Pass:** `src/pages/government/index.astro:272-275`, three sentences, one clause each, a full stop
where a dash was tempting. **Fail:** `src/pages/economy/index.astro:288` and
`src/pages/households/index.astro:144-145` for punctuation;
`src/pages/households/index.astro:121`, `:133` and `:159` for emphasis. This is the only criterion
with a machine-checkable definition of done: **the baseline going to zero is the criterion being
met.** **Cited by #58.**

### Criterion 4 — terms are defined

**Asks:** is every technical term defined the first time a reader meets it? **Pass:** a first use
wrapped in `<Term>`, as at `src/pages/economy/index.astro:33`, resolving to an entry under
`src/content/glossary/`. **Fail:** a term used on a route with no marker and no entry.
Interacts with Criterion 3: `REGISTERED_INITIALISMS` in `pipeline/tests/test_prose.py` is where an
acronym is blessed, and today the glossary's 23 entries include no acronym, so the set cannot be
derived from it. If acronym entries are added, deriving the set from the glossary is the right move
and belongs to the same issue. **Cited by #59.**

### Criterion 5 — prose that lets the reader check

**Asks:** can a reader verify each claim from the figure and its source? No causation the data does
not support, no hype, figures always with units. **Pass:**
`src/pages/economy/index.astro:108-111`, which says outright that nothing in the section identifies a
cause. **Fail:** any sentence in which one series drives another, or any bare number without its
unit. Bounded by **Drift and quoted material**: rewording around a figure is in scope, restating the
figure is not. **Cited by #60.**

### Criterion 6 — hand-off

**Asks:** does each section hand off to the next, and each route to the next, rather than stopping?
**Pass:** the Economy route's section 6 limits block, which hands off to `/households` and is already
recorded as `Shipped` on `ECO-6` in `docs/feature-matrix.md`. **Fail:** a terminal section that ends
on its last caveat with nowhere to go. **Cited by #61.**

### Criterion 7 — drift and quoted material

**Asks:** does the edit leave the registry, the source line and the accessible name where it found
them? **Pass:** a reworded paragraph whose registered figure is unchanged, whose `_meta.source` is
untouched, and whose finding and `aria-label` moved together. **Fail:** any one of the three moved
alone. Cross-cutting, and **cited by all six** C-issues. Its surfaces are
`pipeline/curated/prose_figures.yaml`, `src/components/Figure.astro:45-46` and
`src/components/Figure.astro:61`, and `pipeline/tests/test_accessibility.py:283-300`.

### What each downstream issue attaches to

| Criterion | Issue | Attaches to |
|---|---|---|
| 1 | **#52** | The `.kicker` + heading + `.standfirst` block opening each section across the three route pages. Prose only: no figure, no data and no `aria-label` change |
| 2 | **#53** | `.standfirst` and `.finding` elements — 13 and 11 on `/government`, 8 and 6 on `/households`, 7 and 5 on `/economy`. Constrained by the pairing rule above |
| 3 | **#58** | The whole day-one baseline: 26 prose-class dash fingerprints over 33 rendered occurrences, eight of them ` -- ` on `/households`, and the three shouts at `src/pages/households/index.astro:121`, `:133` and `:159`. Each fix deletes its fingerprint from `KNOWN_DASH_DEBT` or `KNOWN_SHOUT_DEBT` in the same commit |
| 4 | **#59** | `src/content/glossary/` (23 entries), `src/components/Term.astro`, and each route's first use of each term. Owns any move of `REGISTERED_INITIALISMS` onto the glossary |
| 5 | **#60** | `.prose` bodies and `.figure-caveat` notes across all three routes, plus the Government route's section 12 limits block |
| 6 | **#61** | The closing paragraph of each section and the terminal section of each route: Economy section 6, Households section 7, Government section 12 |
| 7 | all six | `pipeline/curated/prose_figures.yaml`, `src/components/Figure.astro:45-46` and `src/components/Figure.astro:61`, and `pipeline/tests/test_accessibility.py:283-300` |

Two surfaces no C-issue can reach, each filed and each named beside the baseline entries it owns:

- **#102** — the island-generated accessible names. `src/components/islands/BudgetChart.tsx:84` (31
  per-fiscal-year labels from one template) and
  `src/components/islands/StatutoryVsEffective.tsx:97` (` -- ` inside a chart's accessible name).
  Both are `.tsx` edits, outside #58's prose-editing remit.
- **#103** — the curated-data shouts. `pipeline/curated/laws.yaml:287` and
  `src/data/party_splits.json:22`. A pipeline change requiring regeneration and revalidation.

## Checklist — status per item

What only a human reader can judge. Every item is **NOT EXECUTED** on landing, and that is a
statement about this contract's coverage, not a formality. Nothing below is enforced by
`pipeline/tests/test_prose.py`, and no agent in this loop has read the site as a reader.

1. **Read each route end to end, once, without stopping to check anything.** Does the argument hold
   together, and does each section earn the next? — **NOT EXECUTED.** Human required. Criterion 1 and
   Criterion 6.
2. **For each figure, read the standfirst, then the chart, then the finding, in that order.** Does
   the finding say something the chart shows, and could a reader disagree with it from the chart
   alone? — **NOT EXECUTED.** Human required. Criterion 2.
3. **Read every `.finding` against its chart `aria-label`.** They are meant to be the same sentence.
   Divergence is invisible to `test_every_chart_svg_states_a_finding`, which checks the label's shape
   and not its agreement with the finding beside it. — **NOT EXECUTED.** Human required. Criterion 7.
4. **Read the site as someone who does not know the vocabulary.** Which terms are used before they
   are defined, and which glossary entries are never reached from prose? — **NOT EXECUTED.** Human
   required. Criterion 4.
5. **Check every causal-sounding sentence against what the data can support.** "Rose while" is a
   claim about a series; "rose because" is a claim about the world. — **NOT EXECUTED.** Human
   required. Criterion 5.
6. **Check sentence rhythm out loud**, which is the only reliable test for the long clause-stacked
   sentence the dash was hiding. A dash removed and replaced with a comma pair sometimes reveals a
   sentence that should have been two. — **NOT EXECUTED.** Human required. Criterion 3.
7. **Read the figure notes as a sceptical reader**, asking of each one whether it tells the reader
   what the chart cannot do or merely restates what it does. — **NOT EXECUTED.** Human required.
   Criterion 5.
