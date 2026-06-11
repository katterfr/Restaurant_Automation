'use client'
import { useState } from 'react'

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}

// ── Bar Chart ──────────────────────────────────────────────────────────────────

export function BarChart({
  data,
  color = '#16a34a',
  height = 160,
  formatValue = String,
  showEvery = 5,
}: {
  data: { label: string; short?: string; value: number }[]
  color?: string
  height?: number
  formatValue?: (n: number) => string
  showEvery?: number
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  if (!data.length) return <div style={{ height }} className="flex items-center justify-center text-xs text-gray-400">No data yet</div>

  const W = 600, H = height
  const padL = 8, padR = 8, padT = 14, padB = 28
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const maxVal = Math.max(...data.map(d => d.value), 1)
  const barW   = chartW / data.length
  const gap    = barW * 0.25

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" style={{ height }} onMouseLeave={() => setHovered(null)}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (
        <line key={i} x1={padL} x2={W - padR}
          y1={padT + chartH * (1 - g)} y2={padT + chartH * (1 - g)}
          stroke="#f1f5f9" strokeWidth={1} />
      ))}

      {data.map((d, i) => {
        const barH = Math.max((d.value / maxVal) * chartH, d.value > 0 ? 2 : 0)
        const bx   = padL + i * barW + gap / 2
        const bw   = barW - gap
        const by   = padT + chartH - barH
        const dim  = hovered !== null && hovered !== i
        return (
          <g key={i}>
            <rect x={bx} y={by} width={bw} height={Math.max(barH, 1)}
              fill={color} opacity={dim ? 0.3 : 1} rx={2}
              style={{ transition: 'opacity 0.12s' }} />
            {/* wider invisible hit area */}
            <rect x={padL + i * barW} y={padT} width={barW} height={chartH}
              fill="transparent" onMouseEnter={() => setHovered(i)} />
          </g>
        )
      })}

      {/* X labels */}
      {data.map((d, i) => {
        if (i % showEvery !== 0 && i !== data.length - 1) return null
        return (
          <text key={i} x={padL + i * barW + barW / 2} y={H - 6}
            textAnchor="middle" fill={hovered === i ? '#111827' : '#9ca3af'}
            style={{ fontSize: 10, fontWeight: hovered === i ? 700 : 400 }}>
            {d.short ?? d.label}
          </text>
        )
      })}

      {/* Tooltip */}
      {hovered !== null && (() => {
        const d     = data[hovered]
        const label = formatValue(d.value)
        const barH  = (d.value / maxVal) * chartH
        const cx    = padL + hovered * barW + barW / 2
        const ty    = padT + chartH - barH - 10
        const tW    = label.length * 7.5 + 16
        const tx    = clamp(cx - tW / 2, 2, W - tW - 2)
        return (
          <g>
            <rect x={tx} y={ty - 18} width={tW} height={20} rx={4} fill="#111827" />
            <text x={tx + tW / 2} y={ty - 5} textAnchor="middle" fill="white" style={{ fontSize: 11 }}>{label}</text>
          </g>
        )
      })()}
    </svg>
  )
}

// ── Line Chart ─────────────────────────────────────────────────────────────────

function smoothLine(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], c = pts[i]
    const cpx = p.x + (c.x - p.x) / 2
    d += ` C ${cpx} ${p.y} ${cpx} ${c.y} ${c.x} ${c.y}`
  }
  return d
}

export function LineChart({
  data,
  color = '#16a34a',
  height = 160,
  formatValue = String,
  showEvery = 5,
}: {
  data: { label: string; short?: string; value: number }[]
  color?: string
  height?: number
  formatValue?: (n: number) => string
  showEvery?: number
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  if (!data.length) return <div style={{ height }} className="flex items-center justify-center text-xs text-gray-400">No data yet</div>

  const W = 600, H = height
  const padL = 8, padR = 8, padT = 14, padB = 28
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const maxVal = Math.max(...data.map(d => d.value), 1)
  const gradId = `line-grad-${color.replace(/[^a-z0-9]/gi, '')}`

  const pts = data.map((d, i) => ({
    x: padL + (data.length > 1 ? (i / (data.length - 1)) * chartW : chartW / 2),
    y: padT + chartH - (d.value / maxVal) * chartH,
  }))

  const line  = smoothLine(pts)
  const area  = line + ` L ${pts[pts.length - 1].x} ${padT + chartH} L ${pts[0].x} ${padT + chartH} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" style={{ height }} onMouseLeave={() => setHovered(null)}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (
        <line key={i} x1={padL} x2={W - padR}
          y1={padT + chartH * g} y2={padT + chartH * g}
          stroke="#f1f5f9" strokeWidth={1} />
      ))}

      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y}
          r={hovered === i ? 5 : 3}
          fill={hovered === i ? color : '#fff'}
          stroke={color} strokeWidth={2}
          style={{ transition: 'r 0.1s, fill 0.1s' }} />
      ))}

      {/* Invisible hover strips */}
      {data.map((_, i) => {
        const stripW = chartW / data.length
        return (
          <rect key={i} x={padL + i * stripW} y={padT} width={stripW} height={chartH}
            fill="transparent" onMouseEnter={() => setHovered(i)} />
        )
      })}

      {data.map((d, i) => {
        if (i % showEvery !== 0 && i !== data.length - 1) return null
        return (
          <text key={i} x={pts[i].x} y={H - 6} textAnchor="middle"
            fill={hovered === i ? '#111827' : '#9ca3af'}
            style={{ fontSize: 10, fontWeight: hovered === i ? 700 : 400 }}>
            {d.short ?? d.label}
          </text>
        )
      })}

      {hovered !== null && (() => {
        const d = data[hovered], p = pts[hovered]
        const label = formatValue(d.value)
        const tW = label.length * 7.5 + 16
        const tx = clamp(p.x - tW / 2, 2, W - tW - 2)
        return (
          <g>
            <line x1={p.x} y1={padT} x2={p.x} y2={padT + chartH}
              stroke="#e5e7eb" strokeWidth={1} strokeDasharray="4 3" />
            <rect x={tx} y={p.y - 30} width={tW} height={20} rx={4} fill="#111827" />
            <text x={tx + tW / 2} y={p.y - 17} textAnchor="middle" fill="white" style={{ fontSize: 11 }}>{label}</text>
          </g>
        )
      })()}
    </svg>
  )
}

// ── Donut Chart ────────────────────────────────────────────────────────────────

function polarXY(cx: number, cy: number, r: number, deg: number) {
  const a = (deg - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

function donutSegment(cx: number, cy: number, outer: number, inner: number, start: number, end: number) {
  const s1 = polarXY(cx, cy, outer, start)
  const e1 = polarXY(cx, cy, outer, end)
  const s2 = polarXY(cx, cy, inner, end)
  const e2 = polarXY(cx, cy, inner, start)
  const lg  = end - start > 180 ? 1 : 0
  return [
    `M ${s1.x} ${s1.y}`,
    `A ${outer} ${outer} 0 ${lg} 1 ${e1.x} ${e1.y}`,
    `L ${s2.x} ${s2.y}`,
    `A ${inner} ${inner} 0 ${lg} 0 ${e2.x} ${e2.y}`,
    'Z',
  ].join(' ')
}

export function DonutChart({
  data,
  size = 130,
}: {
  data: { label: string; value: number; color: string }[]
  size?: number
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const total = data.reduce((s, d) => s + d.value, 0)

  if (total === 0) {
    return (
      <div className="flex items-center gap-6">
        <div style={{ width: size, height: size, minWidth: size }}
          className="rounded-full border-8 border-gray-100 flex items-center justify-center">
          <span className="text-xs text-gray-400">No data</span>
        </div>
      </div>
    )
  }

  const cx = size / 2, cy = size / 2
  const outerR = size / 2 - 4
  const innerR = outerR * 0.58
  const gap = 2

  let angle = 0
  const segs = data.map((d, i) => {
    const sweep = (d.value / total) * (360 - gap * data.length)
    const seg = { ...d, i, start: angle, end: angle + sweep }
    angle += sweep + gap
    return seg
  })

  const hovSeg = hovered !== null ? segs[hovered] : null

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} style={{ minWidth: size }}>
        {segs.map(seg => (
          <path
            key={seg.i}
            d={donutSegment(cx, cy, outerR, innerR, seg.start, seg.end)}
            fill={seg.color}
            opacity={hovered !== null && hovered !== seg.i ? 0.35 : 1}
            style={{ transition: 'opacity 0.12s', cursor: 'pointer' }}
            onMouseEnter={() => setHovered(seg.i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        {/* Centre label */}
        <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="middle"
          fill={hovSeg ? hovSeg.color : '#111827'}
          style={{ fontSize: 17, fontWeight: 700 }}>
          {hovSeg ? hovSeg.value : total}
        </text>
        <text x={cx} y={cy + 11} textAnchor="middle"
          fill="#9ca3af" style={{ fontSize: 10 }}>
          {hovSeg ? hovSeg.label : 'total'}
        </text>
      </svg>

      <div className="flex-1 space-y-2 min-w-0">
        {data.map((d, i) => (
          <div key={i}
            className="flex items-center justify-between gap-2 text-xs cursor-default"
            style={{ opacity: hovered !== null && hovered !== i ? 0.35 : 1, transition: 'opacity 0.12s' }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-gray-700 capitalize truncate">{d.label}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 font-medium">
              <span className="text-gray-900">{d.value}</span>
              <span className="text-gray-400 font-normal">{Math.round(d.value / total * 100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
