/** The shared brushable year-range timeline for the Households route.
 *
 *  Two `Slider.Thumb`s pick a `[lo, hi]` year range; Radix supplies roving
 *  focus, arrow/Home/End/PageUp/PageDown keys and `role="slider"` on each.
 *  `minStepsBetweenThumbs={4}` keeps the range from collapsing narrower than
 *  five years, which would not be a readable chart.
 *
 *  Mount-gated: without JS the control is not in the HTML at all, so a reader
 *  never meets a dead slider. The charts below it are complete at their
 *  default full range regardless. */
import { useEffect, useState } from 'react'
import * as Slider from '@radix-ui/react-slider'

export interface YearRangeProps {
  min: number
  max: number
  value: [number, number]
  onChange: (value: [number, number]) => void
  /** e.g. "Years shown". Also doubles as the slider's accessible name. */
  label: string
  /** Distinguishes this instance's ids, since two `YearRange`s live on one page. */
  id: string
}

export function YearRange({ min, max, value, onChange, label, id }: YearRangeProps) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  if (!ready) return null

  const [lo, hi] = value
  const labelId = `${id}-label`

  return (
    <div className="year-range">
      <p className="year-range-label" id={labelId}>{label}</p>
      <Slider.Root
        className="year-range-slider"
        aria-labelledby={labelId}
        min={min}
        max={max}
        step={1}
        minStepsBetweenThumbs={4}
        value={[lo, hi]}
        onValueChange={(v) => onChange([v[0], v[1]])}
      >
        <Slider.Track className="year-range-track">
          <Slider.Range className="year-range-range" />
        </Slider.Track>
        <Slider.Thumb
          className="year-range-thumb"
          aria-label="First year shown"
          aria-valuetext={String(lo)}
        />
        <Slider.Thumb
          className="year-range-thumb"
          aria-label="Last year shown"
          aria-valuetext={String(hi)}
        />
      </Slider.Root>
      <div className="year-range-endpoints" aria-hidden="true">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      <p aria-live="polite" className="readout year-range-readout">
        Showing {lo} to {hi}.
      </p>
    </div>
  )
}
