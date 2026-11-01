import type { ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { BookFormat, PdfZoom, ReaderFont, ReaderSettings, ReaderTheme } from '@shared/types'
import { Popover, type Anchor } from '../components/Popover'
import { PALETTES } from './epub-styles'

interface Props {
  anchor: Anchor
  format: BookFormat
  settings: ReaderSettings
  zoom?: number
  onChange(patch: Partial<ReaderSettings>): void
  onZoom?(factor: number): void
  onClose(): void
}

const THEMES: Array<[ReaderTheme, string]> = [
  ['paper', 'Paper'],
  ['sepia', 'Sepia'],
  ['night', 'Night']
]

const FONTS: Array<[ReaderFont, string]> = [
  ['publisher', 'Book'],
  ['serif', 'Serif'],
  ['sans', 'Sans']
]

const ZOOMS: Array<[PdfZoom, string]> = [
  ['page-width', 'Fit width'],
  ['page-fit', 'Fit page'],
  ['auto', 'Auto']
]

function Stepper(props: {
  value: number
  min: number
  max: number
  step: number
  format(v: number): string
  onChange(v: number): void
}): ReactNode {
  const { value, min, max, step } = props
  return (
    <div className="stepper">
      <button className="icon-btn icon-btn--sm" disabled={value <= min} onClick={() => props.onChange(Math.max(min, +(value - step).toFixed(2)))}>
        <Minus size={14} />
      </button>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => props.onChange(Number(e.target.value))} />
      <button className="icon-btn icon-btn--sm" disabled={value >= max} onClick={() => props.onChange(Math.min(max, +(value + step).toFixed(2)))}>
        <Plus size={14} />
      </button>
      <output>{props.format(value)}</output>
    </div>
  )
}

export function AppearancePanel({ anchor, format, settings: s, zoom, onChange, onZoom, onClose }: Props): ReactNode {
  return (
    <Popover anchor={anchor} onClose={onClose} align="end">
      <div className="appearance">
        <div className="appearance__row">
          <span className="appearance__label">Page</span>
          <div className="theme-chips">
            {THEMES.map(([t, label]) => (
              <button
                key={t}
                className="theme-chip"
                aria-pressed={s.theme === t}
                style={{ background: PALETTES[t].bg, color: PALETTES[t].fg }}
                onClick={() => onChange({ theme: t })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {format === 'epub' ? (
          <>
            <div className="appearance__row">
              <span className="appearance__label">Font</span>
              <div className="seg">
                {FONTS.map(([f, label]) => (
                  <button key={f} aria-pressed={s.font === f} onClick={() => onChange({ font: f })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="appearance__row">
              <span className="appearance__label">Text size</span>
              <Stepper value={s.fontSize} min={13} max={30} step={1} format={(v) => `${v}px`} onChange={(v) => onChange({ fontSize: v })} />
            </div>
            <div className="appearance__row">
              <span className="appearance__label">Line spacing</span>
              <Stepper value={s.lineHeight} min={1.2} max={2.2} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => onChange({ lineHeight: v })} />
            </div>
            <div className="appearance__row">
              <span className="appearance__label">Line length</span>
              <Stepper value={s.width} min={480} max={960} step={20} format={(v) => `${v}`} onChange={(v) => onChange({ width: v })} />
            </div>
            <div className="appearance__row">
              <span className="appearance__label">Layout</span>
              <div className="seg">
                <button aria-pressed={s.flow === 'paginated' && s.columns === 1} onClick={() => onChange({ flow: 'paginated', columns: 1 })}>
                  One page
                </button>
                <button aria-pressed={s.flow === 'paginated' && s.columns === 2} onClick={() => onChange({ flow: 'paginated', columns: 2 })}>
                  Two pages
                </button>
                <button aria-pressed={s.flow === 'scrolled'} onClick={() => onChange({ flow: 'scrolled' })}>
                  Scroll
                </button>
              </div>
            </div>
            <label className="toggle-row">
              Justify and hyphenate
              <input type="checkbox" checked={s.justify} onChange={(e) => onChange({ justify: e.target.checked })} />
            </label>
          </>
        ) : (
          <>
            <div className="appearance__row">
              <span className="appearance__label">Zoom</span>
              <div className="seg">
                {ZOOMS.map(([z, label]) => (
                  <button key={z} aria-pressed={s.pdfZoom === z} onClick={() => onChange({ pdfZoom: z })}>
                    {label}
                  </button>
                ))}
              </div>
              {onZoom && (
                <div className="stepper" style={{ justifyContent: 'center' }}>
                  <button className="icon-btn icon-btn--sm" onClick={() => onZoom(1 / 1.1)}>
                    <Minus size={14} />
                  </button>
                  <output style={{ width: 56, textAlign: 'center' }}>{Math.round((zoom ?? 1) * 100)}%</output>
                  <button className="icon-btn icon-btn--sm" onClick={() => onZoom(1.1)}>
                    <Plus size={14} />
                  </button>
                </div>
              )}
            </div>
            <label className="toggle-row">
              Invert pages in the night theme
              <input type="checkbox" checked={s.pdfNight} onChange={(e) => onChange({ pdfNight: e.target.checked })} />
            </label>
          </>
        )}
      </div>
    </Popover>
  )
}
