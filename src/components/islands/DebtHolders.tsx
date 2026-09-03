/** Section 2: who holds the debt.
 *
 *  Two stacked horizontal bars with connector lines, never a pie: Bar A splits
 *  gross debt into public / intragovernmental; Bar B is the opened-up public
 *  slice, split into domestic / foreign. sections.md's chart note is explicit
 *  that a pie cannot express that subset relationship.
 *
 *  Every foreign percentage is rendered through `foreignShare`, the single
 *  formatter that names both denominators (publicly held debt, gross debt).
 *  See discrepancies.yaml -> foreign_share_of_debt and
 *  docs/contracts/interfaces/curated-snapshots.md.
 *
 *  Drawn on `charts/RechartsFrame.tsx` as a `<BarChart layout="vertical">`
 *  with one stack per bar. Read that file's header before editing this one.
 *
 *  BOTH AXES ARE HIDDEN, and that is the figure's own claim rather than an
 *  omission. Each bar fills the width of its OWN total, and those totals are
 *  different quantities, gross debt for Bar A and publicly held debt for Bar B.
 *  One labelled value axis across both would assert a shared denominator that
 *  discrepancies.yaml forbids. The connector lines carry the subset relation
 *  and every segment label names its own denominator.
 *
 *  THE MARKS ARE DRAWN IN THE OVERLAY, NOT INSIDE THE TWO `<Bar>` ELEMENTS.
 *  Recharts renders one `<Bar>` completely before the next, so marks nested in
 *  them would run public, domestic, intragovernmental, foreign. Arrow keys
 *  follow DOM order, and this figure reads each bar left to right.
 */
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, type BarShapeProps } from 'recharts'
import { Annotation } from '../charts/Annotation'
import { DATA_LABEL_FONT_PX, placeAnnotation } from '../charts/annotate'
import { firstThatFits, spanRoomAt } from '../charts/axisFit'
import { PlotOverlay, SURFACE_DEFAULTS, useFrame } from '../charts/RechartsFrame'
import { frame as makeFrame } from '../charts/scales'
import { TableView } from './TableView'
import type { Frame } from '../charts/scales'
import type { DebtHolders as DebtHoldersData } from '../../data/types'
import { ChartHint } from '../charts/ChartHint'

type FocusKey = 'public' | 'intragov' | 'domestic' | 'foreign' | 'japan' | 'uk' | 'china'

const fmtT = (v: number) => (v < 1 ? `$${Math.round(v * 1000)}B` : `$${v.toFixed(2)}T`)

/** Each bar is expressed as a share of its own total, so one x domain serves
 *  both rows and each bar fills the width. The shares are computed from the
 *  amounts, never from the curated percentage fields, so the split lands where
 *  the two independent dollar scales used to put it. */
const X_DOMAIN: [number, number] = [0, 100]

/** The one place either denominator's percentage is spelled out. Always names
 *  BOTH: a share of publicly held debt is a different quantity from a share
 *  of gross debt, and sections.md/discrepancies.yaml require they never read
 *  as one. See discrepancies.yaml -> foreign_share_of_debt. */
const foreignShare = (ofPublicPct: number, ofGrossPct: number) =>
  `${ofPublicPct}% of publicly held debt, ${ofGrossPct}% of gross debt`

export function DebtHolders({ d }: { d: DebtHoldersData }) {
  const [focus, setFocus] = useState<FocusKey | null>(null)

  const model = useMemo(() => {
    const split = Object.fromEntries(d.split.map((s) => [s.k, s])) as Record<
      'public' | 'intragov',
      (typeof d.split)[number]
    >
    const publicSplit = Object.fromEntries(d.public_split.map((s) => [s.k, s])) as Record<
      'domestic' | 'foreign',
      (typeof d.public_split)[number]
    >
    const foreignOfGross = d.foreign_share_history.find((h) => h.year === 2025)?.share_of_gross_pct
    if (foreignOfGross == null) throw new Error('DebtHolders: no 2025 point in foreign_share_history')

    const publicAmt = split.public.amount_t
    const domesticAmt = (publicAmt * publicSplit.domestic.share_of_public_pct) / 100
    const foreignAmt = (publicAmt * publicSplit.foreign.share_of_public_pct) / 100

    return { split, publicSplit, foreignOfGross, publicAmt, domesticAmt, foreignAmt }
  }, [d])

  const { split, publicSplit, foreignOfGross, publicAmt, domesticAmt, foreignAmt } = model

  const rows = useMemo(
    () => {
      const pctPublic = (publicAmt / d.total_debt_t) * 100
      const pctDomestic = (domesticAmt / publicAmt) * 100
      return [
        { row: 'gross', first: pctPublic, second: 100 - pctPublic },
        { row: 'public', first: pctDomestic, second: 100 - pctDomestic },
      ]
    },
    [d.total_debt_t, publicAmt, domesticAmt],
  )

  /* `useFrame` supplies the container measurement, the roving group and the
   * wrapper that carries the handlers Recharts strips off the surface. Its own
   * frame is discarded, because two bars and a leader block set this figure's
   * height and no viewBox preset expresses that. */
  const { boxRef, size, narrow, surfaceRef, wrapperProps, mark } = useFrame({
    rows,
    xOf: () => 0,
    yValues: [],
    xDomain: X_DOMAIN,
  })

  const W = size.width
  const barH = narrow ? 26 : 34
  const connH = narrow ? 34 : 46

  /* The two rows are Recharts category bands, so each bar is centred in its own
   * band. Two bands of `barH + connH` therefore leave exactly `connH` between
   * the bars, which is the gap the connector lines run through. */
  const innerHeight = 2 * (barH + connH)
  const barTop = (i: number) => (i + 0.5) * (barH + connH) - barH / 2
  const yA = barTop(0)
  const yB = barTop(1)
  const leadersY = yB + barH + (narrow ? 0 : 18)
  // The leader block sits partly below the plot. `connH / 2` of it fits inside.
  const gutterBottom = Math.max(0, (narrow ? 30 : 64) - connH / 2)
  const H = size.margin.top + innerHeight + gutterBottom

  const f = useMemo(
    () =>
      makeFrame(W, H, {
        top: size.margin.top,
        right: size.margin.right,
        bottom: gutterBottom,
        left: size.margin.left,
      }),
    [W, H, gutterBottom, size.margin.top, size.margin.right, size.margin.left],
  )
  const iw = f.innerWidth

  // The two segment boundaries, in plot units. Same quantities the two dollar
  // scales produced before, because each is a share of its own bar's total.
  const boundaryA = (publicAmt / d.total_debt_t) * iw
  const boundaryB = (domesticAmt / publicAmt) * iw

  const chartMargin = useMemo(
    () => ({
      top: size.margin.top,
      right: size.margin.right,
      bottom: gutterBottom,
      left: size.margin.left,
    }),
    [size.margin.top, size.margin.right, size.margin.left, gutterBottom],
  )
  const chartStyle = useMemo(
    () => ({ width: '100%', height: 'auto', aspectRatio: `${W} / ${H}` }),
    [W, H],
  )

  const describe = (k: FocusKey): string => {
    switch (k) {
      case 'public':
        return `Held by the public: ${fmtT(split.public.amount_t)}, ${split.public.share_pct}% of gross debt`
      case 'intragov':
        return `Intragovernmental holdings: ${fmtT(split.intragov.amount_t)}, ${split.intragov.share_pct}% of gross debt`
      case 'domestic':
        return `Domestic holders: ${fmtT(domesticAmt)}, ${publicSplit.domestic.share_of_public_pct}% of publicly held debt`
      case 'foreign':
        return `Foreign holders: ${fmtT(foreignAmt)}, ${foreignShare(publicSplit.foreign.share_of_public_pct, foreignOfGross)}`
      case 'japan':
        return `Japan: ${fmtT(d.top_foreign[0].amount_t)} of foreign-held debt`
      case 'uk':
        return `United Kingdom: ${fmtT(d.top_foreign[1].amount_t)} of foreign-held debt`
      case 'china':
        return `China: ${fmtT(d.top_foreign[2].amount_t)} of foreign-held debt`
    }
  }

  const ariaLabel = `${fmtT(d.total_debt_t)} of the federal debt is held by the public and ` +
    `intragovernmentally; about ${foreignShare(publicSplit.foreign.share_of_public_pct, foreignOfGross)} is held abroad.`

  const leaderX = (i: number) => boundaryB + ((iw - boundaryB) * (i + 1)) / 4

  // Segment labels are middle-anchored on their own segment, so two things
  // bound them: the distance to the neighbouring label's centre, and the SVG's
  // own edges. The long foreign variant, the amount followed by `foreignShare`
  // in full, needs 416 units against the 231 it has, and shipped CUT after
  // `…of publicly held d`: a complete-looking figure that is not the figure
  // (#66, the #64 shape). The intragovernmental label overran by 24.8 the same
  // way.
  //
  // The variant is picked by FIT, recomputed from the segment centres on every
  // render, never from the `narrow` boolean or a stored width. That is what
  // makes it vintage-proof (E6): the foreign share moves with every Treasury
  // release, so a fix keyed on today's split would regress on the next refresh.
  // Fitting the centre gap is also what makes a same-row collision impossible
  // by construction rather than by inspection (E8).
  const labelFor = (variants: string[], centre: number, gap: number, fr: Frame) =>
    firstThatFits(variants, Math.min(gap, spanRoomAt(centre, fr, 'middle')), DATA_LABEL_FONT_PX)

  const centreA = [boundaryA / 2, boundaryA + (iw - boundaryA) / 2]
  const centreB = [boundaryB / 2, boundaryB + (iw - boundaryB) / 2]
  const gapA = centreA[1] - centreA[0]
  const gapB = centreB[1] - centreB[0]
  const publicLabel = labelFor([
    `Held by the public ${fmtT(split.public.amount_t)} (${split.public.share_pct}% of gross debt)`,
    `Held by the public ${fmtT(split.public.amount_t)} (${split.public.share_pct}%)`,
    `Public ${fmtT(split.public.amount_t)} (${split.public.share_pct}%)`,
    `Public ${fmtT(split.public.amount_t)}`,
    fmtT(split.public.amount_t),
  ], centreA[0], gapA, f)
  const intragovLabel = labelFor([
    `Intragovernmental ${fmtT(split.intragov.amount_t)} (${split.intragov.share_pct}% of gross debt)`,
    `Intragovernmental ${fmtT(split.intragov.amount_t)} (${split.intragov.share_pct}%)`,
    `Intragov. ${fmtT(split.intragov.amount_t)} (${split.intragov.share_pct}%)`,
    `Intragov. ${fmtT(split.intragov.amount_t)}`,
    fmtT(split.intragov.amount_t),
  ], centreA[1], gapA, f)
  // Domestic's percentage always keeps its denominator, for the same
  // reason foreignShare names both of its own: a share of publicly held
  // debt is a different quantity from a share of gross debt, and
  // discrepancies.yaml requires they never read as one. So the ladder
  // drops the percentage entirely rather than orphaning it.
  const domesticLabel = labelFor([
    `Domestic ${fmtT(domesticAmt)} (${publicSplit.domestic.share_of_public_pct}% of publicly held)`,
    `Domestic ${fmtT(domesticAmt)}`,
    fmtT(domesticAmt),
  ], centreB[0], gapB, f)
  const foreignLabel = labelFor([
    `Foreign ${fmtT(foreignAmt)} (${foreignShare(publicSplit.foreign.share_of_public_pct, foreignOfGross)})`,
    `Foreign ${fmtT(foreignAmt)}`,
    fmtT(foreignAmt),
  ], centreB[1], gapB, f)

  // `mark()` runs once per mark HERE, in this island's own render, in the order
  // a reader crosses them. Every mark lives in the overlay, so no Recharts
  // subtree ever advances the counter on its own.
  const segmentMarks = {
    public: mark(),
    intragov: mark(),
    domestic: mark(),
    foreign: mark(),
  }
  const leaderMarks = narrow ? [] : (['japan', 'uk', 'china'] as const).map(() => mark())

  const segment = (
    k: 'public' | 'intragov' | 'domestic' | 'foreign',
    x: number,
    width: number,
    y: number,
  ) => (
    <rect
      className="datum"
      x={x}
      y={y}
      width={width}
      height={barH}
      fill="transparent"
      {...segmentMarks[k]}
      role="img"
      aria-label={describe(k)}
      onFocus={() => setFocus(k)}
      onBlur={() => setFocus(null)}
      onMouseEnter={() => setFocus(k)}
      onMouseLeave={() => setFocus(null)}
    />
  )

  return (
    <div ref={boxRef}>
      <div {...wrapperProps}>
        <BarChart
          ref={surfaceRef}
          layout="vertical"
          data={rows}
          width={W}
          height={H}
          margin={chartMargin}
          style={chartStyle}
          {...SURFACE_DEFAULTS}
          aria-label={ariaLabel}
        >
          <CartesianGrid horizontal={false} vertical={false} fill="var(--panel)" fillOpacity={1} />
          <XAxis type="number" domain={X_DOMAIN} dataKey="first" hide />
          <YAxis type="category" dataKey="row" hide />

          {/* The stack gives each segment its x and its width. The row geometry
              stays here, because the connector block between the bars is this
              figure's own and no band layout expresses it. */}
          <Bar
            dataKey="first"
            stackId="holders"
            barSize={barH}
            isAnimationActive={false}
            activeBar={false}
            shape={(props: BarShapeProps) => {
              const i = props.originalDataIndex
              if (!Number.isFinite(props.width)) return null
              return (
                <rect
                  key={i}
                  x={props.x}
                  y={barTop(i)}
                  width={props.width}
                  height={barH}
                  fill={i === 0 ? 'var(--public)' : 'var(--domestic)'}
                />
              )
            }}
          />
          <Bar
            dataKey="second"
            stackId="holders"
            barSize={barH}
            isAnimationActive={false}
            activeBar={false}
            shape={(props: BarShapeProps) => {
              const i = props.originalDataIndex
              if (!Number.isFinite(props.width)) return null
              return (
                <rect
                  key={i}
                  x={props.x}
                  y={barTop(i)}
                  width={props.width}
                  height={barH}
                  fill={i === 0 ? 'var(--intragov)' : 'var(--foreign)'}
                />
              )
            }}
          />

          <PlotOverlay margin={f.margin}>
            {publicLabel && (
              <Annotation frame={f} x={centreA[0]} y={yA - 8} anchor="middle" className="holders-label" label={publicLabel} />
            )}
            {intragovLabel && (
              <Annotation frame={f} x={centreA[1]} y={yA - 8} anchor="middle" className="holders-label" label={intragovLabel} />
            )}

            {/* ---- Connectors: Bar B is the opened-up public slice of Bar A ---- */}
            <line x1={0} y1={yA + barH} x2={0} y2={yB} stroke="var(--ink-soft)" strokeWidth={0.75} />
            <line x1={boundaryA} y1={yA + barH} x2={iw} y2={yB} stroke="var(--ink-soft)" strokeWidth={0.75} />

            {domesticLabel && (
              <Annotation frame={f} x={centreB[0]} y={yB + barH + 16} anchor="middle" className="holders-label" label={domesticLabel} />
            )}
            {foreignLabel && (
              <Annotation frame={f} x={centreB[1]} y={yB + barH + 16} anchor="middle" className="holders-label" label={foreignLabel} />
            )}

            {segment('public', 0, boundaryA, yA)}
            {segment('intragov', boundaryA, iw - boundaryA, yA)}
            {segment('domestic', 0, boundaryB, yB)}
            {segment('foreign', boundaryB, iw - boundaryB, yB)}

            {/* ---- Top foreign holders, leadered off the foreign segment ----
             *  Point markers, evenly spaced for legibility: Japan/UK/China are
             *  the three LARGEST foreign holders, not an exhaustive partition
             *  of the foreign segment, so they are never drawn as sub-widths. */}
            {!narrow && (['japan', 'uk', 'china'] as const).map((k, i) => {
              const idx = k === 'japan' ? 0 : k === 'uk' ? 1 : 2
              const cx = leaderX(i)
              const leaderLabel = `${d.top_foreign[idx].country} ${fmtT(d.top_foreign[idx].amount_t)}`
              // One label per ROW, staggered down. The three leader points are
              // 46.6 units apart and `United Kingdom $880B` alone is 136, so on
              // a shared baseline they sat on top of each other, every
              // clipping assertion green, and the figure unreadable (E8). A
              // leader line is the idiom that makes a label at a different
              // depth still name its own point.
              // <Annotation> does not accept role or handlers, and widening
              // it to would make the one sanctioned annotation path a props
              // grab-bag. So these three keep their own <text> and take their x
              // from `placeAnnotation` instead. Shift-only: a leader label
              // re-anchored would leave the leader line it belongs to.
              const placed = placeAnnotation({
                x: cx, label: leaderLabel, frame: f, anchor: 'middle',
                fontPx: DATA_LABEL_FONT_PX, flip: false,
              })
              return (
                <g key={k}>
                  <line x1={cx} y1={yB + barH} x2={cx} y2={leadersY + i * 13} stroke="var(--ink-soft)" strokeWidth={0.5} />
                  <circle cx={cx} cy={yB + barH / 2} r={2.5} fill="var(--ink)" />
                  {placed && (
                    <text
                      className="datum holders-label"
                      x={placed.x} y={leadersY + 12 + i * 13} textAnchor={placed.textAnchor}
                      {...leaderMarks[i]} role="img" aria-label={describe(k)}
                      onFocus={() => setFocus(k)} onBlur={() => setFocus(null)}
                      onMouseEnter={() => setFocus(k)} onMouseLeave={() => setFocus(null)}
                    >
                      {leaderLabel}
                    </text>
                  )}
                </g>
              )
            })}
          </PlotOverlay>
        </BarChart>
      </div>

      {narrow && (
        <ul className="holders-foreign-list">
          {d.top_foreign.map((c) => (
            <li key={c.country}>{c.country}: {fmtT(c.amount_t)}</li>
          ))}
        </ul>
      )}

      <p aria-live="polite" className="readout">
        {focus ? describe(focus) : <ChartHint noun="segment" />}
      </p>

      <TableView
        caption="Who holds the federal debt"
        columns={[
          { key: 'holder', label: 'Holder', unit: 'category' },
          { key: 'amount', label: 'Amount', unit: '$ trillions' },
          { key: 'ofGross', label: 'Share of gross debt', unit: 'percent' },
          { key: 'ofPublic', label: 'Share of publicly held debt', unit: 'percent' },
        ]}
        rows={[
          { holder: split.public.label, amount: split.public.amount_t.toFixed(2), ofGross: split.public.share_pct, ofPublic: null },
          { holder: split.intragov.label, amount: split.intragov.amount_t.toFixed(2), ofGross: split.intragov.share_pct, ofPublic: null },
          { holder: publicSplit.domestic.label, amount: domesticAmt.toFixed(2), ofGross: null, ofPublic: publicSplit.domestic.share_of_public_pct },
          { holder: publicSplit.foreign.label, amount: foreignAmt.toFixed(2), ofGross: foreignOfGross, ofPublic: publicSplit.foreign.share_of_public_pct },
          ...d.top_foreign.map((c) => ({
            holder: `${c.country} (foreign holder)`, amount: c.amount_t.toFixed(2), ofGross: null, ofPublic: null,
          })),
        ]}
      />
    </div>
  )
}
