/** Section 9: the same $16.75 trillion, two ways.
 *
 *  A diverging horizontal bar per bucket, zero on a shared vertical baseline.
 *  Gross increases run right of zero, reductions run left of zero, and a
 *  filled diamond marks the net value. Sign and position carry the net-vs-
 *  gross and surplus-vs-reduction facts; colour is never the only carrier,
 *  see partyColor below for why the president view is deliberately NOT
 *  coloured by party.
 *
 *  Both Tabs.Content panels are forceMount'd and rendered unconditionally, so
 *  the inactive one exists in the DOM (Radix hides it with the native `hidden`
 *  attribute) rather than being mounted on first switch, hydration cannot
 *  reflow the page, and a reader with JavaScript disabled still gets one full,
 *  server-rendered figure (the default coalition view) with nothing to grow
 *  into later.
 *
 *  Drawn on `charts/RechartsFrame.tsx` as a `<BarChart layout="vertical">` per
 *  panel, with `stackOffset="sign"` so the two signed series diverge from one
 *  baseline. Read that file's header before editing this one.
 *
 *  `useFrame` IS NOT USED HERE, and the reason is the forceMount above. That
 *  hook measures its own container, and the inactive panel is `hidden`, so it
 *  would measure zero and keep the wide preset on a phone until the reader
 *  switched tabs. The parent measures once and hands both panels one size, as
 *  it always has. Everything else comes from the shared frame, including the
 *  two reference-identity rules, which are restated at the code they govern.
 */
import { useMemo, useState, type ReactNode } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { Bar, BarChart, YAxis, type BarShapeProps } from 'recharts'
import { ZeroLine } from '../charts/Axis'
import {
  PlotGrid,
  PlotOverlay,
  PlotXAxis,
  SURFACE_DEFAULTS,
  useAxisLabel,
  useTickFormat,
} from '../charts/RechartsFrame'
import { frame as makeFrame, linear } from '../charts/scales'
import { useRovingMarks } from '../charts/roving'
import { useChartSize, type ChartSize } from '../charts/useChartSize'
import { TableView } from './TableView'
import { byCoalition, byPresident, TOTALS, type Bucket } from '../attribution/aggregate'

type View = 'coalition' | 'president'

const VIEWS: { value: View; label: string; buckets: Bucket[]; axisLabel: string }[] = [
  { value: 'coalition', label: 'By voting coalition', buckets: byCoalition, axisLabel: 'Coalition' },
  { value: 'president', label: 'By signing president', buckets: byPresident, axisLabel: 'Signing president' },
]

const fmtT = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}T`

/** The bar thickness, in plot units. Fixed rather than derived, so a three-row
 *  panel and a five-row panel draw the same bar. */
const BAR_H = 12

/** A Recharts bar span turned into an SVG rect's `x` and `width`.
 *
 *  MEASURED, NOT DEFENSIVE. Recharts computes a horizontal bar as
 *  `x = scale(base)` and `width = scale(value) - scale(base)`, so a bar running
 *  LEFT of the zero line arrives with a NEGATIVE width and an `x` that is its
 *  right edge. An SVG rect cannot express that. Chromium rejects the attribute
 *  and paints nothing, which cost this figure its four deficit-reduction bars
 *  on `/government`, in both panels, with no visible fault other than the
 *  missing bars. The diverging half of a diverging bar chart is exactly the
 *  half this hits, so both shapes below go through here. */
function spanOf(x: number, width: number): { x: number; width: number } {
  return { x: Math.min(x, x + width), width: Math.abs(width) }
}

/** The one string shared by a bar's aria-label and its focus/hover readout,
 *  so the two can never say different things about the same row. */
function describe(b: Bucket): string {
  const lawWord = b.laws === 1 ? 'law' : 'laws'
  const reduction = b.reductions < 0 ? `, deficit reductions ${fmtT(b.reductions)}` : ''
  const netWord = b.net < 0 ? 'net reduction' : 'net'
  const coalitionNote =
    b.lawsInCoalition != null && b.lawsInCoalition !== b.laws
      ? ` (${b.lawsInCoalition} in the coalition, ${b.laws} scored)`
      : ''
  return (
    `${b.label}, ${b.detail}, ${b.laws} scored ${lawWord}${coalitionNote}, ` +
    `gross increases ${fmtT(b.increases)}${reduction}, ${netWord} ${fmtT(b.net)}.`
  )
}

function announcement(view: View, buckets: Bucket[]): string {
  const viewLabel = view === 'coalition' ? 'By voting coalition' : 'By signing president'
  const noun = view === 'coalition' ? 'coalitions' : 'presidents'
  return (
    `${viewLabel}. ${buckets.length} ${noun}, net total ${fmtT(TOTALS.net)}, ` +
    `gross increases ${fmtT(TOTALS.increases)}.`
  )
}

/** The bar colour for one bucket. The president view is deliberately NOT
 *  coloured by party, because a president is not a voting coalition. */
function bucketColor(view: View, key: string): string {
  if (view !== 'coalition') return 'var(--mand)'
  if (key === 'party-line-r') return 'var(--gop)'
  if (key === 'party-line-d') return 'var(--dem)'
  return 'var(--mix)'
}

/** One tab's figure + table. Pure function of its bucket list and the shared
 *  container size, so coalition (3 rows) and president (5 rows) each get
 *  their own row height and x-scale rather than borrowing the other's. */
function Panel({
  view,
  axisLabel,
  label,
  buckets,
  size,
  active,
  onActivate,
  onDeactivate,
}: {
  view: View
  axisLabel: string
  label: string
  buckets: Bucket[]
  size: ChartSize
  active: string | null
  onActivate: (key: string) => void
  onDeactivate: () => void
}): ReactNode {
  const { width: W, height: H, margin: m } = size
  const narrow = W < 500
  const f = useMemo(() => makeFrame(W, H, m), [W, H, m])
  const iw = f.innerWidth
  const rowH = (H - m.top - m.bottom) / buckets.length
  const y = (i: number) => rowH * i + rowH / 2

  const maxMag = Math.max(
    ...buckets.map((b) => Math.max(b.increases, -b.reductions, Math.abs(b.net))),
    0.1,
  )

  /* RULE 1. Both of these are compared by reference. A fresh `ticks` array on
   * each render makes Recharts unmount and remount the graphical item, and the
   * remount destroys whichever mark holds focus, so the roving group answers
   * one arrow press and then leaves focus on `<body>`. */
  const { x, xDomain, xTicks } = useMemo(() => {
    const domain: [number, number] = [-maxMag * 1.08, maxMag * 1.08]
    const scale = linear(domain, [0, iw])
    return { x: scale, xDomain: domain, xTicks: scale.ticks(narrow ? 4 : 6) }
  }, [maxMag, iw, narrow])

  const xFormat = useTickFormat(fmtT, null)
  const yLabel = useAxisLabel(axisLabel, 'y')
  const chartMargin = useMemo(
    () => ({ top: m.top, right: m.right, bottom: 0, left: 0 }),
    [m.top, m.right],
  )
  const chartStyle = useMemo(
    () => ({ width: '100%', height: 'auto', aspectRatio: `${W} / ${H}` }),
    [W, H],
  )

  /* The chart's prop bag is filtered down to SVG attributes, so the roving
   * group's handlers cannot ride the surface. They sit on the wrapper and
   * reach the marks by bubbling. Only `ref`, `role`, `aria-label` and `data-*`
   * survive the filter. */
  const { groupProps, mark } = useRovingMarks()
  const { ref: surfaceRef, 'data-roving': roving, ...handlers } = groupProps
  const wrapperHandlers = handlers as unknown as React.HTMLAttributes<HTMLDivElement>

  // `mark()` runs once per row HERE, in this component's own render, in row
  // order. Every mark lives in the overlay, so no Recharts subtree advances
  // the counter on its own.
  const markProps = buckets.map(() => mark())

  return (
    <>
      <div
        className="chart"
        {...wrapperHandlers}
        {...(roving != null ? { 'data-roving': '' } : {})}
      >
        <BarChart
          ref={surfaceRef}
          layout="vertical"
          stackOffset="sign"
          data={buckets}
          width={W}
          height={H}
          margin={chartMargin}
          style={chartStyle}
          {...SURFACE_DEFAULTS}
          aria-label={`Net ten-year legislative cost ${view === 'coalition' ? 'by voting coalition' : 'by signing president'}, totalling ${fmtT(TOTALS.net)} net and ${fmtT(TOTALS.increases)} gross.`}
        >
          <PlotGrid />
          <PlotXAxis
            dataKey="net"
            domain={xDomain}
            ticks={xTicks}
            gutter={m.bottom}
            unit="$ trillions, ten-year score at enactment"
            format={xFormat}
          />
          {/* The bucket names are drawn on their own rows rather than as ticks,
              because they sit above each bar pair and a Recharts `tick`
              renderer is a fresh function on every render, which rule 1
              forbids. The axis keeps the gutter and the title. */}
          <YAxis
            type="category"
            dataKey="key"
            width={m.left}
            tick={false}
            axisLine={false}
            tickLine={false}
            label={yLabel}
          />

          {/* `stackOffset="sign"` is what makes these two diverge from one
              baseline. Increases are positive and run right of zero;
              reductions are kept negative and run left of it.

              Both shapes go through `spanOf`, for the reason recorded there. */}
          <Bar
            dataKey="increases"
            stackId="score"
            barSize={BAR_H}
            isAnimationActive={false}
            activeBar={false}
            shape={(props: BarShapeProps) => {
              const i = props.originalDataIndex
              const b = buckets[i]
              if (!b || b.increases <= 0 || !Number.isFinite(props.width)) return null
              const span = spanOf(props.x, props.width)
              return (
                <rect
                  key={b.key}
                  x={span.x}
                  y={y(i) - BAR_H / 2}
                  width={span.width}
                  height={BAR_H}
                  fill={bucketColor(view, b.key)}
                  opacity={0.55}
                />
              )
            }}
          />
          <Bar
            dataKey="reductions"
            stackId="score"
            barSize={BAR_H}
            isAnimationActive={false}
            activeBar={false}
            shape={(props: BarShapeProps) => {
              const i = props.originalDataIndex
              const b = buckets[i]
              if (!b || b.reductions >= 0 || !Number.isFinite(props.width)) return null
              const span = spanOf(props.x, props.width)
              return (
                <rect
                  key={b.key}
                  x={span.x}
                  y={y(i) - BAR_H / 2}
                  width={span.width}
                  height={BAR_H}
                  fill="var(--positive)"
                  opacity={0.55}
                />
              )
            }}
          />

          <PlotOverlay margin={f.margin}>
            <ZeroLine frame={f} y={0} />
            <line x1={x(0)} x2={x(0)} y1={0} y2={f.innerHeight} stroke="var(--ink)" strokeWidth={1} />

            {buckets.map((b, i) => {
              const isActive = active === b.key
              const netColor = b.net < 0 ? 'var(--positive)' : bucketColor(view, b.key)
              return (
                <g key={b.key}>
                  <path
                    d={`M ${x(b.net) - 6} ${y(i)} L ${x(b.net)} ${y(i) - 6} L ${x(b.net) + 6} ${y(i)} L ${x(b.net)} ${y(i) + 6} Z`}
                    fill={netColor}
                  />
                  <text
                    x={narrow ? x(0) : 4}
                    y={narrow ? y(i) - 14 : y(i) - 12}
                    className="attrib-row-label"
                    textAnchor={narrow ? 'middle' : 'start'}
                  >
                    {b.label}
                    {b.net < 0 ? ' (net reduction)' : ''}
                  </text>
                  <text
                    x={x(b.net) + (b.net < 0 ? -10 : 10)}
                    y={y(i)}
                    dy="0.32em"
                    textAnchor={b.net < 0 ? 'end' : 'start'}
                    className="attrib-row-label"
                  >
                    {fmtT(b.net)}
                  </text>
                  {/* The full row is one focusable, hoverable datum. */}
                  <rect
                    className="datum"
                    x={0}
                    y={y(i) - rowH / 2}
                    width={iw}
                    height={rowH}
                    fill="transparent"
                    {...markProps[i]}
                    role="img"
                    aria-label={describe(b)}
                    onFocus={() => onActivate(b.key)}
                    onBlur={onDeactivate}
                    onMouseEnter={() => onActivate(b.key)}
                    onMouseLeave={onDeactivate}
                    stroke={isActive ? 'var(--ink)' : 'none'}
                    strokeWidth={1}
                  />
                </g>
              )
            })}
          </PlotOverlay>
        </BarChart>
      </div>

      <TableView
        caption={`Net ten-year legislative cost, ${label.toLowerCase()}`}
        columns={[
          { key: 'bucket', label: axisLabel, unit: '—' },
          { key: 'gross', label: 'Gross increases', unit: '$ trillions' },
          { key: 'reductions', label: 'Deficit reductions', unit: '$ trillions' },
          { key: 'net', label: 'Net', unit: '$ trillions' },
          { key: 'laws', label: 'Scored laws', unit: 'count' },
        ]}
        rows={[
          ...buckets.map((b) => ({
            bucket: b.label,
            gross: fmtT(b.increases),
            reductions: fmtT(b.reductions),
            net: fmtT(b.net),
            laws: b.laws,
          })),
          {
            bucket: 'Total',
            gross: fmtT(TOTALS.increases),
            reductions: fmtT(TOTALS.reductions),
            net: fmtT(TOTALS.net),
            laws: TOTALS.scoredLaws,
          },
        ]}
      />
    </>
  )
}

export function AttributionSplit() {
  const [view, setView] = useState<View>('coalition')
  const [active, setActive] = useState<string | null>(null)
  const [announced, setAnnounced] = useState(() => announcement('coalition', byCoalition))

  const [boxRef, size] = useChartSize()

  return (
    <div ref={boxRef}>
      <Tabs.Root
        value={view}
        onValueChange={(v) => {
          const next = v as View
          setView(next)
          setActive(null)
          setAnnounced(announcement(next, VIEWS.find((vv) => vv.value === next)!.buckets))
        }}
      >
        <Tabs.List className="attrib-tabs" aria-label="Break down the $16.75 trillion">
          {VIEWS.map((v) => (
            <Tabs.Trigger key={v.value} value={v.value} className="attrib-tab">
              {v.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <p className="attrib-legend">
          Bar right of zero: gross increases. Bar left of zero: deficit reductions. Diamond: net.
        </p>

        {VIEWS.map((v) => (
          <Tabs.Content key={v.value} value={v.value} forceMount tabIndex={0} className="attrib-panel">
            <Panel
              view={v.value}
              axisLabel={v.axisLabel}
              label={v.label}
              buckets={v.buckets}
              size={size}
              active={view === v.value ? active : null}
              onActivate={(key) => setActive(key)}
              onDeactivate={() => setActive(null)}
            />
          </Tabs.Content>
        ))}
      </Tabs.Root>

      <p aria-live="polite" className="readout">
        {active ? describe(VIEWS.find((v) => v.value === view)!.buckets.find((b) => b.key === active)!) : announced}
      </p>
    </div>
  )
}
