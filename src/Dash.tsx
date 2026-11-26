import { useApp } from './store'
import { fmt } from './nlp'
import type { Post } from './types'

const DAY = 86400000
const COL = { pos: '#2EC4B6', neu: '#94A3B8', neg: '#E5484D', navy: '#0B1F3A', coral: '#FF6B35' }

export function dayBuckets(posts: Post[], days: number) {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  return Array.from({ length: days }, (_, i) => {
    const d0 = start.getTime() - (days - 1 - i) * DAY, inDay = posts.filter((p) => p.ts >= d0 && p.ts < d0 + DAY)
    return { d0, total: inDay.length, pos: inDay.filter((p) => p.sentiment === 'positive').length, neg: inDay.filter((p) => p.sentiment === 'negative').length }
  })
}

/** Mentions per day as an area line, with negative mentions drawn on top. */
export function TrendChart({ posts, days }: { posts: Post[]; days: number }) {
  const { lang } = useApp()
  const b = dayBuckets(posts, days), W = 560, H = 170, P = 22, max = Math.max(1, ...b.map((x) => x.total))
  const x = (i: number) => P + (b.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (b.length - 1)), y = (v: number) => H - 24 - (v / max) * (H - 48)
  const line = (k: 'total' | 'neg') => b.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' ')
  const step = Math.ceil(b.length / 7)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mentions per day" style={{ width: '100%', height: 'auto', display: 'block' }}>
      {[0, 0.5, 1].map((g) => <line key={g} x1={P} x2={W - P} y1={y(max * g)} y2={y(max * g)} stroke="#DCE1E8" strokeDasharray={g ? '3 4' : ''} />)}
      <text x={P} y={y(max) - 6} fontSize="10" fill="#64748B">{max}</text>
      <path d={`${line('total')} L${x(b.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} fill={COL.navy} opacity=".08" />
      <path d={line('total')} fill="none" stroke={COL.navy} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <path d={line('neg')} fill="none" stroke={COL.neg} strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
      {b.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.total)} r="3" fill={COL.navy}><title>{new Date(p.d0).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en', { month: 'short', day: 'numeric' })}: {p.total}</title></circle>)}
      {b.map((p, i) => i % step === 0 && <text key={'l' + i} x={x(i)} y={H - 6} fontSize="10" textAnchor="middle" fill="#64748B">{new Date(p.d0).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</text>)}
    </svg>
  )
}

/** Positive / neutral / negative share as a donut. */
export function Donut({ posts }: { posts: Post[] }) {
  const n = posts.length || 1, c = (s: string) => posts.filter((p) => p.sentiment === s).length
  const parts = [{ k: 'Positive', v: c('positive'), col: COL.pos }, { k: 'Neutral', v: c('neutral'), col: COL.neu }, { k: 'Negative', v: c('negative'), col: COL.neg }]
  const { t } = useApp(); const R = 46, C = 2 * Math.PI * R; let off = 0
  return (
    <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox="0 0 120 120" width="130" height="130" role="img" aria-label="Sentiment mix">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#E6ECF4" strokeWidth="16" />
        {posts.length > 0 && parts.map((p) => { const len = (p.v / n) * C, el = <circle key={p.k} cx="60" cy="60" r={R} fill="none" stroke={p.col} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 60 60)" />; off += len; return el })}
        <text x="60" y="58" textAnchor="middle" fontSize="20" fontWeight="600" fill={COL.navy}>{posts.length}</text><text x="60" y="74" textAnchor="middle" fontSize="9" fill="#64748B">{t('Mentions')}</text>
      </svg>
      <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>{parts.map((p) => <div key={p.k} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><i style={{ width: 10, height: 10, borderRadius: 3, background: p.col, display: 'inline-block' }} /><span style={{ minWidth: 64 }}>{t(p.k)}</span><b>{Math.round((p.v / n) * 100)}%</b><span className="muted">({p.v})</span></div>)}</div>
    </div>
  )
}

export function TopVoices({ posts, n = 5 }: { posts: Post[]; n?: number }) {
  const m = new Map<string, { author: string; count: number; reach: number }>()
  posts.forEach((p) => { const o = m.get(p.author) || { author: p.author, count: 0, reach: 0 }; o.count++; o.reach += p.reach; m.set(p.author, o) })
  const rows = [...m.values()].sort((a, b) => b.reach - a.reach || b.count - a.count).slice(0, n)
  return <>{rows.length ? rows.map((r) => <div className="row2" key={r.author} style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}><span>{r.author}</span><span className="muted">{r.count} · <b style={{ color: 'var(--navy)' }}>{fmt(r.reach)}</b></span></div>) : <p className="muted">—</p>}</>
}

/** Change against the previous period of the same length, as +x% / -x%. */
export function Delta({ cur, prev, goodWhenUp = true }: { cur: number; prev: number; goodWhenUp?: boolean }) {
  const { t } = useApp()
  if (!prev) return <small className="muted">—</small>
  const d = Math.round(((cur - prev) / prev) * 100), good = d === 0 ? null : (d > 0) === goodWhenUp
  return <small style={{ color: good === null ? 'var(--muted)' : good ? 'var(--ok)' : 'var(--err)' }}>{d > 0 ? '▲ +' : d < 0 ? '▼ ' : ''}{d}% <span className="muted">{t('vs previous period')}</span></small>
}
