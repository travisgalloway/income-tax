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
takes parentheses. Fail: `src/pages/households/index.astro:145-146` reads "what people actually pay
-- the average federal tax rate -- has moved far less"; an appositive gloss takes a comma pair. Pass:
`src/pages/government/index.astro:272-275`, which does the same work with a full stop and a new
sentence. Enforced by `test_no_prose_string_contains_an_em_dash_or_a_double_hyphen`.

**No all-caps emphasis.** Capitals are the `.kicker`'s role and nothing else's (Ruling 2). Fail:
`src/pages/households/index.astro:122`, "The bracket COUNT is a policy choice". Fail:
`src/pages/households/index.astro:134`, "Surtaxes ARE folded into the published top rate". Fail, in a
figure note, `src/pages/households/index.astro:159`, "it INCLUDES PAYROLL TAX". Pass:
`src/pages/government/index.astro:448` and `src/pages/government/index.astro:455`, which put the
emphasis on a `<strong>` noun phrase, and `src/pages/households/index.astro:262`, which does the same
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
`pipeline/tests/test_accessibility.py:284-306`: a digit, at least 40 characters, no leading shape
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
| amplifying clause | `src/pages/government/index.astro:429` | colon, or a full stop and a new sentence |
| appositive gloss | `src/pages/households/index.astro:145-146` | comma pair |
| generated readout separator | `src/components/islands/BudgetChart.tsx:84` | full stop. The readout's other fields are already separated by ". ", so one template edit clears all 31 labels |

Four scoping decisions, each stated so that no future issue has to litigate a grep:

1. **` -- ` is retired outright.** No ASCII stand-in is blessed. It is not an em dash and it is not a
   substitute for one: it renders as two literal hyphens, which is what a reader sees at every
   viewport. Ten instances reached `dist/` on the day this contract landed, all on `/households`;
   #53's Criterion 2 rewrites took two of them, leaving eight.
2. **Numeric-range hyphens are out of scope.** "1946-1950" at
   `src/pages/households/index.astro:116`, "FY1995-FY2025" throughout: a hyphen between two numbers
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
`src/pages/government/index.astro:448`, `src/pages/government/index.astro:455` and
`src/pages/households/index.astro:262`, or a recast that puts the emphasis where the word order puts
it.

Two refinements:

- **The kicker is not literal capitals**, so there is no carve-out. `src/styles/global.css:60-66` is
  `font-variant-caps: all-small-caps`; kicker source text is sentence case
  (`src/pages/economy/index.astro:115`) and passes the same mechanical check as body copy. The rule
  is uniform across every prose class.
- **Figure notes are ruled in, explicitly.** `src/components/Figure.astro:60` renders a `note` into
  the figcaption as `.figure-caveat`, and `.figure-caveat` is inside the allow-list. Without this,
  `src/pages/households/index.astro:159`'s "it INCLUDES PAYROLL TAX" would stay legal. All three
  shouts, `src/pages/households/index.astro:122`, `:134` and `:159`, are assigned to **#58** as one
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

**The mechanical half.** Four positional and textual facts, over the four report routes' built
pages. **Enforced by** `pipeline/tests/test_prose.py:473`, `:492`, `:511` and `:535`: a
`.standfirst` before the section's first `<figure>`; a `.prose` after its **last** `</figure>`; a
standfirst whose number tokens overlap its finding's by less than `PREEMPTION_CEILING`
(`pipeline/tests/test_prose.py:407`, 0.5) on Jaccard, because a standfirst quoting the finding's
exact figures posed no question; and no `<h2>` containing a word from `CONSTRUCTION_WORDS`. Scope is
structural, with no exemption list anywhere: a section is asked the first two questions **because it
carries a `<figure>`**, which is what silently and correctly discharges the three Limits sections
and the `/` intro's four. There is no baseline either. #52 found four violations and fixed all four,
which is the choice the rule below says to make at that count.

**What they cannot see.** They cannot see a heading that names the section's *variables* rather than
its question: "Prices and rates" and "Labor and capital" told the reader what was plotted, not what
was found, and both passed every word list anyone would write. #52 rewrote them by reading, to
`src/pages/economy/index.astro:165` and `src/pages/economy/index.astro:226`. They cannot see a
standfirst that restates its finding **in words** rather than in numbers, and they cannot judge
whether the closing prose answers the question the standfirst actually posed. That is Checklist
item 8, and it is human-judged.

### Criterion 2 — the standfirst sets up, the finding claims

**Asks:** does the standfirst set the chart up, and does the finding state exactly one claim a reader
could falsify against the figure? **Pass:** `src/pages/economy/index.astro:117-124`, where the
standfirst rounds and orients and the finding gives the unrounded values and the comparison between
them. **Fail:** a finding that restates the standfirst, or that joins two claims with "and". Bound by
the pairing rule in **Drift and quoted material**: a finding edit moves the matching `aria-label` in
the same commit, and the label stays inside `pipeline/tests/test_accessibility.py:284-306`.
**Cited by #53.**

**The mechanical half.** Four facts about every `.finding` on the four report routes, and about
the standfirst beside it. **Enforced by** `pipeline/tests/test_prose.py:654`, `:680`, `:714` and
`:739`: no standfirst and finding share a number token that is not a four-digit calendar year (the
year is exempt as a regex class, not as a list, because a standfirst says over what window and a
finding says when, so both name the same years by construction); every finding and every
`figure.figure` accessible name clears the finding-shape floor; no finding runs past
`FINDING_CHARS_MAX` (`pipeline/tests/test_prose.py:629`, 220 characters, with the longest surviving
finding at 193); and each section carries at most one finding, immediately after its standfirst and
before its first figure. The floor is `finding_shape_problems` at
`pipeline/tests/test_accessibility.py:284`, extracted from `test_every_chart_svg_states_a_finding`
with no assertion changed, so the finding and the accessible name this contract calls the same
sentence are held to one predicate rather than two copies of one. Scope is structural: a section is
asked these questions **because it carries a `.finding`**, which discharges the three Limits
sections and the `/` intro's four with no exemption list.

**No baseline, and here is the count.** #53 measured ten live violations: six sections sharing a
non-year token, three findings past 220 characters and a fourth at 216 with no headroom left, and
one `figure.figure` name opening "Chart showing". Ten is #52's road under rule 3 below and not
#51's: all ten are fixed and every assertion above is zero. A ten-entry `fingerprint -> "#owner"`
map would have cost more to maintain than the ten edits cost to make, and there was no third party
to hand it to. #58 owns sentence craft and #60 owns whether a reader can check a claim; neither
owns a standfirst restating its finding.

**What they cannot see.** They cannot see whether a finding states *one* claim.
`government/index.html#whole-budget` is 68 characters and carries three figures; a 200-character
finding can carry exactly one. Length is a proxy and the test says so, and no clause-counter or
"and"-splitter is added to fake the judgement. They cannot see whether a standfirst orients a
reader at all: a numberless restatement of the finding in words passes every check here. They
cannot see whether a finding and the `aria-label` beside it agree, only that both clear the same
floor. Those are Checklist items 2, 3 and 9 below.

### Criterion 3 — sentence craft

**Asks:** sentence length, clause count, punctuation (Ruling 1) and emphasis (Ruling 2).
**Pass:** `src/pages/government/index.astro:272-275`, three sentences, one clause each, a full stop
where a dash was tempting. **Fail:** `src/pages/economy/index.astro:288` and
`src/pages/households/index.astro:145-146` for punctuation;
`src/pages/households/index.astro:122`, `:134` and `:159` for emphasis. This is the only criterion
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
`src/components/Figure.astro:61`, and `pipeline/tests/test_accessibility.py:284-306`.

### How a C-issue lands its criterion

Five rules, set by #52 and followed by #53, #58, #59, #60 and #61. They exist so that six issues
against one contract produce one checker and one contract, not six of each.

1. **One checker.** A criterion's mechanical half becomes tests in `pipeline/tests/test_prose.py`,
   under a numbered `# N. Criterion N — <name>` banner matching the ones already there, reusing
   `parse_html`, `nodes_of`, `PROSE_CLASSES` and `_deep_text`, and reading `dist/**/index.html`. No
   new test file, no second extractor, no source-level grep. The served bytes are the subject, for
   the reason the module docstring gives.
2. **Scope is derived from structure, never from a hand-kept list.** A section with no `<figure>` is
   outside "a `.prose` after the last figure" *because it has no figure*, not because it is named in
   an exemption set. A list that must be maintained is a list that rots, and a rotted list reads as
   a passing check.
3. **The exemption policy is chosen by the violation count, and the choice is stated.** Few live
   violations, and the issue **fixes them all and asserts zero with no baseline** — #52's road, at
   four. Many, and the issue **baselines them as `fingerprint -> "#owner"` asserted with `==`** —
   #51's road, at 26 dash fingerprints, with the baseline reaching zero becoming #58's definition of
   done. Neither is the default. The count decides and the plan says which and why.
4. **The human-judged half is written into the Checklist below as a numbered item marked
   NOT EXECUTED, citing its criterion by number**, and the mechanical check's docstring says out
   loud what it cannot see. It is never dressed up as automation. A word list invented to make a
   human judgement look mechanical is worse than no check, because it reports green.
5. **The per-surface judgement is recorded here, one row per surface, and gated by a test** that
   asserts the table's row set **equals** the set built from `dist/`. Not in a PR body, which
   nothing can re-read and nothing can fail on. A new section then cannot ship without declaring
   what question it answers, and a deleted one cannot leave a stale judgement behind.

Contract, `docs/feature-matrix.md` and `docs/test-plan.md` move in the same commits as the code, as
they do everywhere in this repository. It is restated here because all six of these issues are
docs-adjacent and the temptation to batch the docs into a trailing commit is strongest where the
docs are most of the diff.

### What each downstream issue attaches to

| Criterion | Issue | Attaches to |
|---|---|---|
| 1 | **#52** | The `.kicker` + heading + `.standfirst` block opening each section across the three route pages. Prose only: no figure, no data and no `aria-label` change |
| 2 | **#53** | `.standfirst` and `.finding` elements — 13 and 11 on `/government`, 8 and 6 on `/households`, 7 and 5 on `/economy`. Constrained by the pairing rule above |
| 3 | **#58** | What is left of the day-one baseline: 23 prose-class dash fingerprints over 30 rendered occurrences, six of them ` -- ` on `/households`, and the three shouts at `src/pages/households/index.astro:122`, `:134` and `:159`. It opened at 26 over 33; #53 retired three, because Criterion 2 made it rewrite those three sentences and a rewritten sentence takes its dash with it. Each fix deletes its fingerprint from `KNOWN_DASH_DEBT` or `KNOWN_SHOUT_DEBT` in the same commit |
| 4 | **#59** | `src/content/glossary/` (23 entries), `src/components/Term.astro`, and each route's first use of each term. Owns any move of `REGISTERED_INITIALISMS` onto the glossary |
| 5 | **#60** | `.prose` bodies and `.figure-caveat` notes across all three routes, plus the Government route's section 12 limits block |
| 6 | **#61** | The closing paragraph of each section and the terminal section of each route: Economy section 6, Households section 7, Government section 12 |
| 7 | all six | `pipeline/curated/prose_figures.yaml`, `src/components/Figure.astro:45-46` and `src/components/Figure.astro:61`, and `pipeline/tests/test_accessibility.py:284-306` |

Two surfaces no C-issue can reach, each filed and each named beside the baseline entries it owns:

- **#102** — the island-generated accessible names. `src/components/islands/BudgetChart.tsx:84` (31
  per-fiscal-year labels from one template) and
  `src/components/islands/StatutoryVsEffective.tsx:97` (` -- ` inside a chart's accessible name).
  Both are `.tsx` edits, outside #58's prose-editing remit.
- **#103** — the curated-data shouts. `pipeline/curated/laws.yaml:287` and
  `src/data/party_splits.json:22`. A pipeline change requiring regeneration and revalidation.

### Criterion 1 audit

One row per `<section id>` on the four report routes, twenty-nine of them. The question is a
reviewer's one-line paraphrase of what the section's kicker, heading and standfirst pose before the
reader meets a chart. `pipeline/tests/test_prose.py:589` asserts this table's `Route` and
`Section id` set **equals** the set built from `dist/`, so a section cannot ship without declaring
its question and a deleted section cannot leave its judgement behind. What the test asserts is the
**coverage**, never the wording: whether the paraphrase is honest, and whether the closing prose
answers it, is Checklist item 8.

| Route | Section id | The question it answers | Criterion 1 |
|---|---|---|---|
| / | what-this-is | What is this site for, and what does it refuse to do? | Pass |
| / | where-to-start | Which route should a reader open first, and in what order do the three fit together? | Pass |
| / | how-to-read-a-figure | What are the parts of a figure here, and how does a reader check one against its source? | Pass |
| / | where-the-numbers-come-from | Where does the data come from, and what happens when it stops reconciling? | Pass |
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
first figure" and "prose after the last figure" are not asked of a section that has no figure. That
is the structural scope of rule 2 above, and it is why this contract has no exemption list.

### Criterion 2 audit

One row per `.finding` on the four report routes, twenty-two of them. `The one claim it makes` is a
reviewer's paraphrase of the single thing the finding asserts; `Checkable against` names the figure
whose `<details>` table settles it, which is where the two-figure sections are discharged, because a
finding cannot be checkable against both. `pipeline/tests/test_prose.py:778` asserts this table's
`Route` and `Section id` set **equals** the set of sections carrying a finding in `dist/`. What the
test asserts is the coverage, never the wording: whether the paraphrase is honest, and whether the
finding really states one claim rather than two, is Checklist item 9.

The `/` intro carries no finding and no figure, so it contributes no rows. That is structural scope
again, not an exemption.

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
8. **Read each section in the order standfirst, chart, closing prose.** Does the standfirst pose a
   question a reader could have asked, does the closing prose answer that question rather than
   describe the chart again, and does the heading name a question or a claim rather than the
   section's variables? The last of the three is the half no word list reaches: a heading naming
   what was plotted passes `test_no_section_heading_names_the_charts_construction` and fails this
   criterion on any human reading. — **NOT EXECUTED.** Human required. Criterion 1.
9. **Read each standfirst and its finding as a pair, and ask two questions of them.** Of the
   standfirst: does it name what is plotted, against what, over what window, and what the reader
   should look at? Of the finding: is it one claim, or several joined by a full stop? The mechanical
   half of Criterion 2 measures shared number tokens and character counts, which is why
   `households#who-pays` was catchable and why a standfirst that restates its finding in words
   would not be. Neither number is the judgement. — **NOT EXECUTED.** Human required. Criterion 2.
