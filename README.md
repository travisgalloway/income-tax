# income-tax

A static, interactive site about US federal finance: debt, the budget, spending,
revenue and the votes behind them. Built with Astro, React islands, and
hand-rolled SVG charts (`d3-scale` and `d3-shape`). See `BRIEF.md` for the design
brief and `sections.md` for the section-by-section copy the pages render.

## Site

```bash
npm install
npm run dev      # local dev server
npm run build    # static build to dist/
npm run check    # astro check (type + template diagnostics)
```

## Data pipeline

The datasets in `src/data/*.json` are generated and validated by a Python
pipeline in `pipeline/`.

```bash
cd pipeline
uv run pytest                                  # regression tests
uv run python build.py --tier monthly --dry-run  # rebuild + validate, no writes
```

## Documentation

- `docs/contracts/interfaces/` holds the internal boundaries: the generated-data
  shape each dataset guarantees, and the shared chart-layer contract every
  section island builds against.
- `docs/feature-matrix.md` records what is shipped per route and section.
- `docs/test-plan.md` records coverage by test type, keyed to the feature matrix.
