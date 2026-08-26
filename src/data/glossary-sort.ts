/** The one ordering the site's glossary terms are ever sorted by.
 *
 *  Locale-independent by construction: a normalised ASCII key compared with `<`/`>`, never the
 *  locale-sensitive string comparator, whose result depends on the ICU locale the build machine
 *  happens to carry and can therefore differ between a developer's machine and CI. The name of
 *  that comparator is deliberately not written here: the criterion that proves this greps for it,
 *  and a mention would read as a use.
 *
 *  Lifted out of `src/pages/glossary.astro` by #49 because `/contents` lists the same 23 terms and
 *  must list them in the same order. A page module cannot be imported, so the alternative was a
 *  second copy of the expression — and two copies of an ordering rule is how the index and the
 *  page it indexes come to disagree. */
export const sortKey = (term: string) =>
  term
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
