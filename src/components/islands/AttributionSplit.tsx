/** Section 9: the same $16.75 trillion, two ways.
 *
 *  A diverging horizontal bar per bucket, zero on a shared vertical baseline.
 *  Gross increases run right of zero, reductions run left of zero, and a
 *  filled diamond marks the net value. Sign and position carry the net-vs-
 *  gross and surplus-vs-reduction facts; colour is never the only carrier —
 *  see partyColor below for why the president view is deliberately NOT
 *  coloured by party.
 *
 *  Both Tabs.Content panels are forceMount'd and rendered unconditionally, so
 *  the inactive one exists in the DOM (Radix hides it with the native `hidden`
 *  attribute) rather than being mounted on first switch — hydration cannot
 *  reflow the page, and a reader with JavaScript disabled still gets one full,
 *  server-rendered figure (the default coalition view) with nothing to grow
 *  into later.
 */
import { useState, type ReactNode } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { Chart } from '../charts/Chart'
import { AxisBottom, AxisLeft, ZeroLine } from '../charts/Axis'
import { linear } from '../charts/scales'
import { useChartSize, type ChartSize } from '../charts/useChartSize'
import { TableView } from './TableView'
import { byCoalition, byPresident, TOTALS, type Bucket } from '../attribution/aggregate'

type View = 'coalition' | 'president'

const VIEWS: { value: View; label: string; buckets: Bucket[]; axisLabel: string }[] = [
  { value: 'coalition', label: 'By voting coalition', buckets: byCoalition, axisLabel: 'Coalition' },
  { value: 'president', label: 'By signing president', buckets: byPresident, axisLabel: 'Signing president' },
]

const fmtT = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}T`

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
  const { width: W, height: H, margin: f } = size
  const narrow = W < 500
  const iw = W - f.left - f.right
  const rowH = (H - f.top - f.bottom) / buckets.length
  const y = (i: number) => rowH * i + rowH / 2
  const maxMag = Math.max(...buckets.map((b) => Math.max(b.increases, -b.reductions, Math.abs(b.net))), 0.1)
  const x = linear([-maxMag * 1.08, maxMag * 1.08], [0, iw])
  const xTicks = x.ticks(narrow ? 4 : 6)

  return (
    <>
      <Chart
        ariaLabel={`Net ten-year legislative cost ${view === 'coalition' ? 'by voting coalition' : 'by signing president'}, totalling ${fmtT(TOTALS.net)} net and ${fmtT(TOTALS.increases)} gross.`}
        interactive
        width={W}
        height={H}
        margin={f}
      >
        {(fr) => (
          <>
            <AxisLeft
              frame={fr}
              ticks={buckets.map((_, i) => i)}
              format={() => ''}
              label={axisLabel}
              scale={(i) => y(i)}
            />
            <AxisBottom
              frame={fr}
              ticks={xTicks}
              format={(t) => fmtT(t)}
              label="$ trillions, ten-year score at enactment"
              scale={x}
            />
            <ZeroLine frame={fr} y={0} />
            <line x1={x(0)} x2={x(0)} y1={0} y2={fr.innerHeight} stroke="var(--ink)" strokeWidth={1} />

            {buckets.map((b, i) => {
              const isActive = active === b.key
              const partyColor =
                view === 'coalition'
                  ? b.key === 'party-line-r'
                    ? 'var(--gop)'
                    : b.key === 'party-line-d'
                      ? 'var(--dem)'
                      : 'var(--mix)'
                  : 'var(--mand)'
              const netColor = b.net < 0 ? 'var(--positive)' : partyColor
              return (
                <g key={b.key}>
                  {b.increases > 0 && (
                    <rect
                      x={x(0)}
                      y={y(i) - 6}
                      width={x(b.increases) - x(0)}
                      height={12}
                      fill={partyColor}
                      opacity={0.55}
                    />
                  )}
                  {b.reductions < 0 && (
                    <rect
                      x={x(b.reductions)}
                      y={y(i) - 6}
                      width={x(0) - x(b.reductions)}
                      height={12}
                      fill="var(--positive)"
                      opacity={0.55}
                    />
                  )}
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
                    tabIndex={0}
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
          </>
        )}
      </Chart>

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
