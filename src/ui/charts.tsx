// Small hand-made SVG charts for the research notes, in the island's ink-on-parchment style.
// Rules (dataviz method): one axis, thin marks (2px lines, ≥8px markers), recessive grid, text in
// ink (never in the series colour), direct labels + a legend for ≥ 2 series, a hover tooltip on
// every mark, and a table view (the palette's orange and aqua sit below 3:1 on parchment, so the
// table and the labels carry identity too). Palette validated on #f3e9cb: all checks pass.

import { useMemo, useState, type ReactNode } from 'react'

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'] as const
const INK = '#2b2118', SOFT = '#6b5a45', GRID = 'rgba(43,33,24,0.14)'

export interface Pt { x: number; y: number; label?: string }
export interface Series { name: string; points: Pt[] }

const nice = (lo: number, hi: number, n = 4) => {
  const span = hi - lo || 1
  const step = 10 ** Math.floor(Math.log10(span / n))
  const err = (span / n) / step
  const s = step * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1)
  const out: number[] = []
  for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) out.push(+v.toFixed(10))
  return out
}

function Frame({ title, sub, table, children, legend }: { title: string; sub?: ReactNode; table: { head: string[]; rows: (string | number)[][] }; children: ReactNode; legend?: { name: string; color: string }[] }) {
  const [asTable, setAsTable] = useState(false)
  return (
    <figure className="chart">
      <figcaption>
        <div><b>{title}</b>{sub && <small>{sub}</small>}</div>
        <button className="linkish" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>{asTable ? 'chart' : 'table'}</button>
      </figcaption>
      {legend && legend.length > 1 && !asTable && (
        <div className="legend">{legend.map((l) => <span key={l.name}><i style={{ background: l.color }} />{l.name}</span>)}</div>
      )}
      {asTable ? (
        <div className="chart-table"><table><thead><tr>{table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>
      ) : children}
    </figure>
  )
}

const W = 440, H = 210, M = { l: 40, r: 70, t: 12, b: 30 }

/** Lines over a shared x (e.g. generations). Crosshair + tooltip; labels at the line ends. */
export function LineChart({ title, sub, series, xLabel, yFormat = (v) => `${Math.round(v * 100)}%`, yMax, xFormat = (v) => String(v) }: {
  title: string; sub?: ReactNode; series: Series[]; xLabel: string; yFormat?: (v: number) => string; yMax?: number; xFormat?: (v: number) => string
}) {
  const xs = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b), [series])
  const ys = series.flatMap((s) => s.points.map((p) => p.y)).filter(Number.isFinite)
  const y1 = yMax ?? Math.max(...ys, 0.0001), x0 = xs[0] ?? 0, x1 = xs[xs.length - 1] ?? 1
  const X = (v: number) => M.l + ((v - x0) / (x1 - x0 || 1)) * (W - M.l - M.r)
  const Y = (v: number) => H - M.b - (v / y1) * (H - M.t - M.b)
  const [hx, setHx] = useState<number | null>(null)
  const path = (s: Series) => s.points.filter((p) => Number.isFinite(p.y)).map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('')
  const move = (e: React.MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const vx = x0 + ((((e.clientX - r.left) / r.width) * W - M.l) / (W - M.l - M.r)) * (x1 - x0)
    setHx(xs.reduce((a, b) => (Math.abs(b - vx) < Math.abs(a - vx) ? b : a), xs[0]))
  }
  const legend = series.map((s, i) => ({ name: s.name, color: SERIES[i % SERIES.length] }))
  return (
    <Frame title={title} sub={sub} legend={legend} table={{ head: [xLabel, ...series.map((s) => s.name)], rows: xs.map((x) => [xFormat(x), ...series.map((s) => { const p = s.points.find((q) => q.x === x); return p && Number.isFinite(p.y) ? yFormat(p.y) : '–' })]) }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {nice(0, y1).map((t) => <g key={t}><line x1={M.l} x2={W - M.r} y1={Y(t)} y2={Y(t)} stroke={GRID} /><text x={M.l - 6} y={Y(t) + 4} textAnchor="end" className="tick">{yFormat(t)}</text></g>)}
        {nice(x0, x1, 6).map((t) => <text key={t} x={X(t)} y={H - M.b + 16} textAnchor="middle" className="tick">{xFormat(t)}</text>)}
        <text x={(M.l + W - M.r) / 2} y={H - 2} textAnchor="middle" className="axis">{xLabel}</text>
        {series.map((s, i) => <path key={s.name} d={path(s)} fill="none" stroke={SERIES[i % SERIES.length]} strokeWidth={2} strokeLinejoin="round" />)}
        {series.map((s, i) => { const last = [...s.points].reverse().find((p) => Number.isFinite(p.y)); return last && <text key={s.name} x={X(last.x) + 6} y={Y(last.y) + 4} className="direct">{s.name}</text> })}
        {hx !== null && <line x1={X(hx)} x2={X(hx)} y1={M.t} y2={H - M.b} stroke={INK} strokeOpacity={0.35} />}
        {hx !== null && series.map((s, i) => { const p = s.points.find((q) => q.x === hx); return p && Number.isFinite(p.y) && <circle key={s.name} cx={X(p.x)} cy={Y(p.y)} r={4.5} fill={SERIES[i % SERIES.length]} stroke="#f3e9cb" strokeWidth={2} /> })}
        <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="transparent" onMouseMove={move} onMouseLeave={() => setHx(null)} />
      </svg>
      {hx !== null && (
        <div className="tip" style={{ left: `${(X(hx) / W) * 100}%` }}>
          <b>{xLabel} {xFormat(hx)}</b>
          {series.map((s) => { const p = s.points.find((q) => q.x === hx); return <span key={s.name}>{s.name}: {p && Number.isFinite(p.y) ? yFormat(p.y) : '–'}</span> })}
        </div>
      )}
    </Frame>
  )
}

/** Horizontal bars, value labelled at the end. One measure, one colour (identity is the row label). */
export function Bars({ title, sub, bars, format = (v) => `${Math.round(v * 100)}%`, max }: { title: string; sub?: ReactNode; bars: { label: string; value: number; note?: string }[]; format?: (v: number) => string; max?: number }) {
  const top = max ?? Math.max(...bars.map((b) => b.value).filter(Number.isFinite), 0.0001)
  const [hover, setHover] = useState<number | null>(null)
  const rowH = 30, h = bars.length * rowH + 8, lw = 96
  return (
    <Frame title={title} sub={sub} table={{ head: ['', 'value', ''], rows: bars.map((b) => [b.label, Number.isFinite(b.value) ? format(b.value) : '–', b.note ?? '']) }}>
      <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={title}>
        {bars.map((b, i) => {
          const w = Number.isFinite(b.value) ? Math.max(2, (b.value / top) * (W - lw - 70)) : 0
          const y = 4 + i * rowH
          return (
            <g key={b.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={0} y={y} width={W} height={rowH} fill="transparent" />
              <text x={lw - 8} y={y + 19} textAnchor="end" className="rowlabel">{b.label}</text>
              <rect x={lw} y={y + 7} width={w} height={rowH - 14} rx={4} fill={SERIES[0]} opacity={hover === null || hover === i ? 1 : 0.55} />
              <text x={lw + w + 6} y={y + 19} className="value">{Number.isFinite(b.value) ? format(b.value) : 'n/a'}</text>
            </g>
          )
        })}
      </svg>
      {hover !== null && bars[hover].note && <div className="tip static">{bars[hover].label}: {bars[hover].note}</div>}
    </Frame>
  )
}

/** One 100% bar split into parts (2px gaps), each part labelled. */
export function Split({ title, sub, parts }: { title: string; sub?: ReactNode; parts: { label: string; value: number }[] }) {
  const total = parts.reduce((s, p) => s + (Number.isFinite(p.value) ? p.value : 0), 0) || 1
  let x = 0
  const [hover, setHover] = useState<number | null>(null)
  return (
    <Frame title={title} sub={sub} legend={parts.map((p, i) => ({ name: p.label, color: SERIES[i % SERIES.length] }))} table={{ head: ['', 'share'], rows: parts.map((p) => [p.label, `${Math.round((p.value / total) * 100)}%`]) }}>
      <svg viewBox={`0 0 ${W} 54`} role="img" aria-label={title}>
        {parts.map((p, i) => {
          const w = (p.value / total) * W
          const r = <g key={p.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={x + (i ? 1 : 0)} y={4} width={Math.max(0, w - (i ? 2 : 0) - (i < parts.length - 1 ? 1 : 0))} height={24} rx={4} fill={SERIES[i % SERIES.length]} />
            {w > 60 && <text x={x + w / 2} y={46} textAnchor="middle" className="value">{p.label} {Math.round((p.value / total) * 100)}%</text>}
          </g>
          x += w
          return r
        })}
      </svg>
      {hover !== null && <div className="tip static">{parts[hover].label}: {Math.round((parts[hover].value / total) * 100)}%</div>}
    </Frame>
  )
}

/** Points with a hover label; optional labels drawn for a few. */
export function Scatter({ title, sub, points, xLabel, yLabel, xFormat = (v) => String(Math.round(v)), yFormat = (v) => `${Math.round(v * 100)}%`, labelAll = false }: {
  title: string; sub?: ReactNode; points: Pt[]; xLabel: string; yLabel: string; xFormat?: (v: number) => string; yFormat?: (v: number) => string; labelAll?: boolean
}) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y)
  const x0 = Math.min(...xs, 0), x1 = Math.max(...xs, 1), y0 = Math.min(0, ...ys), y1 = Math.max(...ys, 0.0001)
  const X = (v: number) => M.l + ((v - x0) / (x1 - x0 || 1)) * (W - M.l - M.r)
  const Y = (v: number) => H - M.b - ((v - y0) / (y1 - y0 || 1)) * (H - M.t - M.b)
  const [hover, setHover] = useState<number | null>(null)
  return (
    <Frame title={title} sub={sub} table={{ head: ['', xLabel, yLabel], rows: points.map((p) => [p.label ?? '', xFormat(p.x), yFormat(p.y)]) }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {nice(y0, y1).map((t) => <g key={t}><line x1={M.l} x2={W - M.r} y1={Y(t)} y2={Y(t)} stroke={GRID} /><text x={M.l - 6} y={Y(t) + 4} textAnchor="end" className="tick">{yFormat(t)}</text></g>)}
        {nice(x0, x1, 5).map((t) => <text key={t} x={X(t)} y={H - M.b + 16} textAnchor="middle" className="tick">{xFormat(t)}</text>)}
        <text x={(M.l + W - M.r) / 2} y={H - 2} textAnchor="middle" className="axis">{xLabel}</text>
        <text x={12} y={M.t + 4} className="axis">{yLabel}</text>
        {points.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <circle cx={X(p.x)} cy={Y(p.y)} r={12} fill="transparent" />
            <circle cx={X(p.x)} cy={Y(p.y)} r={hover === i ? 6 : 4.5} fill={SERIES[0]} fillOpacity={0.8} stroke="#f3e9cb" strokeWidth={2} />
            {labelAll && p.label && <text x={X(p.x) + 7} y={Y(p.y) - 6} className="tick">{p.label}</text>}
          </g>
        ))}
      </svg>
      {hover !== null && <div className="tip" style={{ left: `${(X(points[hover].x) / W) * 100}%` }}><b>{points[hover].label}</b><span>{xLabel}: {xFormat(points[hover].x)}</span><span>{yLabel}: {yFormat(points[hover].y)}</span></div>}
    </Frame>
  )
}

/** Signed horizontal bars around a zero line (a correlation per row): positive in the palette's
 *  blue, negative in its orange, the signed value always written at the bar end (so the sign is
 *  never colour alone), and a note per row (e.g. on how many islands it holds). */
export function Diverging({ title, sub, bars, format = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`, max, legend = ['more of it, more children', 'more of it, fewer children'] }: { title: string; sub?: ReactNode; bars: { label: string; value: number; note?: string; dim?: boolean }[]; format?: (v: number) => string; max?: number; legend?: [string, string] }) {
  const top = max ?? Math.max(...bars.map((b) => Math.abs(b.value)).filter(Number.isFinite), 0.0001)
  const [hover, setHover] = useState<number | null>(null)
  const rowH = 30, h = bars.length * rowH + 8, lw = 150, nw = 96
  const plot = W - lw - nw, zero = lw + plot / 2
  const len = (v: number) => (Number.isFinite(v) ? (Math.abs(v) / top) * (plot / 2 - 34) : 0)
  return (
    <Frame title={title} sub={sub} legend={[{ name: legend[0], color: SERIES[0] }, { name: legend[1], color: SERIES[1] }]}
      table={{ head: ['', 'effect', ''], rows: bars.map((b) => [b.label, Number.isFinite(b.value) ? format(b.value) : 'n/a', b.note ?? '']) }}>
      <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={title}>
        <line x1={zero} x2={zero} y1={2} y2={h - 2} stroke={INK} strokeOpacity={0.5} />
        {bars.map((b, i) => {
          const y = 4 + i * rowH, w = Math.max(Number.isFinite(b.value) ? 2 : 0, len(b.value)), pos = b.value >= 0
          const x = pos ? zero + 1 : zero - 1 - w
          return (
            <g key={b.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} opacity={b.dim ? 0.55 : 1}>
              <rect x={0} y={y} width={W} height={rowH} fill="transparent" />
              <text x={lw - 8} y={y + 19} textAnchor="end" className="rowlabel">{b.label}</text>
              {Number.isFinite(b.value) && <rect x={x} y={y + 7} width={w} height={rowH - 14} rx={4} fill={pos ? SERIES[0] : SERIES[1]} opacity={hover === null || hover === i ? 1 : 0.55} />}
              <text x={Number.isFinite(b.value) ? (pos ? x + w + 5 : x - 5) : zero + 5} y={y + 19} textAnchor={Number.isFinite(b.value) && !pos ? 'end' : 'start'} className="value">{Number.isFinite(b.value) ? format(b.value) : 'n/a'}</text>
              {b.note && <text x={W - nw + 6} y={y + 19} className="tick">{b.note}</text>}
            </g>
          )
        })}
      </svg>
      {hover !== null && bars[hover].note && <div className="tip static">{bars[hover].label}: {Number.isFinite(bars[hover].value) ? format(bars[hover].value) : 'n/a'} · {bars[hover].note}</div>}
    </Frame>
  )
}

/** Two series side by side per category (e.g. top vs bottom half, per condition); values at the
 *  bar ends, legend above, a 2px gap between the pair. */
export function Paired({ title, sub, groups, series, format = (v) => v.toFixed(2) }: { title: string; sub?: ReactNode; groups: { label: string; values: [number, number]; note?: string }[]; series: [string, string]; format?: (v: number) => string }) {
  const top = Math.max(...groups.flatMap((g) => g.values).filter(Number.isFinite), 0.0001)
  const [hover, setHover] = useState<number | null>(null)
  const barH = 14, gH = barH * 2 + 2 + 18, h = groups.length * gH + 6, lw = 110
  return (
    <Frame title={title} sub={sub} legend={series.map((n, i) => ({ name: n, color: SERIES[i] }))}
      table={{ head: ['', ...series, ''], rows: groups.map((g) => [g.label, ...g.values.map((v) => (Number.isFinite(v) ? format(v) : '–')), g.note ?? '']) }}>
      <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={title}>
        {groups.map((g, i) => {
          const y = 4 + i * gH
          return (
            <g key={g.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={0} y={y} width={W} height={gH} fill="transparent" />
              <text x={lw - 8} y={y + barH + 5} textAnchor="end" className="rowlabel">{g.label}</text>
              {g.values.map((v, k) => {
                const w = Number.isFinite(v) ? Math.max(2, (v / top) * (W - lw - 60)) : 0
                const by = y + k * (barH + 2)
                return <g key={k}><rect x={lw} y={by} width={w} height={barH} rx={4} fill={SERIES[k]} opacity={hover === null || hover === i ? 1 : 0.55} /><text x={lw + w + 5} y={by + barH - 3} className="value">{Number.isFinite(v) ? format(v) : 'n/a'}</text></g>
              })}
            </g>
          )
        })}
      </svg>
      {hover !== null && <div className="tip static">{groups[hover].label}: {series[0]} {format(groups[hover].values[0])}, {series[1]} {format(groups[hover].values[1])}{groups[hover].note ? ` · ${groups[hover].note}` : ''}</div>}
    </Frame>
  )
}

// ---------------------------------------------------------------- plain comparisons (HTML)
// The default way to show a finding to anyone: two groups, one number each (e.g. average
// children), the better group on top in the accent colour, the other in grey, values written at
// the bar ends. One shared scale for every row, so rows compare with each other too.

export interface CompareRow { key: string; label: string; sub?: string; a: { label: string; value: number; n?: number }; b: { label: string; value: number; n?: number }; note?: string }

/** `fixed`: always show `a` first in the accent colour (when a and b are the same two groups in every row). */
export function Compare({ rows, unit, noteHead, format = (v) => v.toFixed(1), max, fixed = false }: { rows: CompareRow[]; unit: string; noteHead?: string; format?: (v: number) => string; max?: number; fixed?: boolean }) {
  const top = max ?? Math.max(...rows.flatMap((r) => [r.a.value, r.b.value]).filter(Number.isFinite), 0.0001)
  const bar = (g: CompareRow['a'], win: boolean) => (
    <div className={`cmp-bar ${win ? 'win' : ''}`} title={`${g.label}: ${format(g.value)} ${unit}${g.n ? ` (${g.n} agents)` : ''}`}>
      <span className="cmp-g">{g.label}</span>
      <span className="cmp-track"><i style={{ width: `calc((100% - 44px) * ${Math.max(0.01, g.value / top)})` }} /><b>{format(g.value)}</b></span>
    </div>
  )
  return (
    <div className="cmp">
      {noteHead && <div className="cmp-head"><span /><span className="sc">{unit}</span><span className="sc">{noteHead}</span></div>}
      {rows.map((r) => {
        const aWins = fixed || r.a.value >= r.b.value
        const [first, second] = aWins ? [r.a, r.b] : [r.b, r.a]
        return (
          <div className="cmp-row" key={r.key}>
            <div className="cmp-label"><b>{r.label}</b>{r.sub && <small>{r.sub}</small>}</div>
            <div className="cmp-bars">{bar(first, true)}{bar(second, false)}</div>
            {noteHead !== undefined && <div className="cmp-note">{r.note ?? '–'}</div>}
          </div>
        )
      })}
    </div>
  )
}

/** One number per named row, largest first, one hue (e.g. average children by job). */
export function Ranked({ rows, unit, format = (v) => v.toFixed(1), keepOrder = false }: { rows: { label: string; value: number; n?: number }[]; unit: string; format?: (v: number) => string; keepOrder?: boolean }) {
  const sorted = keepOrder ? rows : [...rows].sort((a, b) => b.value - a.value)
  const top = Math.max(...sorted.map((r) => r.value).filter(Number.isFinite), 0.0001)
  return (
    <div className="ranked">
      {sorted.map((r) => (
        <div className="rk-row" key={r.label} title={`${r.label}: ${format(r.value)} ${unit}${r.n ? ` (${r.n} agents)` : ''}`}>
          <span className="rk-l">{r.label}</span>
          <span className="cmp-track"><i style={{ width: `calc((100% - 44px) * ${Math.max(0.01, r.value / top)})` }} /><b>{format(r.value)}</b></span>
        </div>
      ))}
    </div>
  )
}

/** A titled box for the HTML charts (same look as the SVG charts' frame, no table toggle). */
export function Panel({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <figure className="chart panel">
      <figcaption><div><b>{title}</b>{sub && <small>{sub}</small>}</div></figcaption>
      {children}
    </figure>
  )
}

/** One square per island: filled where the pattern showed up. */
export function Tally({ marks, yes, no }: { marks: boolean[]; yes: string; no: string }) {
  const k = marks.filter(Boolean).length
  return (
    <div className="tally">
      <div className="tally-row">{marks.map((m, i) => <span key={i} className={m ? 'on' : ''} title={`Island ${i + 1}: ${m ? yes : no}`}>{m ? '✓' : ''}</span>)}</div>
      <p className="sc"><b>{k} of {marks.length}</b> islands: {yes}{k < marks.length ? ` · ${marks.length - k}: ${no}` : ''}</p>
    </div>
  )
}
