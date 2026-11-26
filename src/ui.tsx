import type { ReactNode } from 'react'
import { Bell, FileText, LayoutDashboard, MessageSquareText, Settings, Sparkles, TrendingUp, Users } from 'lucide-react'
import enLogo from './assets/logo-en.svg'
import enLogoRev from './assets/logo-en-reversed.svg'
import arLogo from './assets/logo-ar.svg'
import arLogoRev from './assets/logo-ar-reversed.svg'
import markDark from './assets/mark.svg'
import markLight from './assets/mark-reversed.svg'
import type { Post } from './types'
import { ago, fmt } from './nlp'
import { useApp } from './store'

/** Scoop360 logo. Arabic lockup in Arabic, English otherwise; reversed (white) version on navy. */
export const Logo = ({ light = true, mark = false, height = 34 }: { light?: boolean; mark?: boolean; height?: number }) => {
  const { lang } = useApp()
  const src = mark ? (light ? markLight : markDark) : lang === 'ar' ? (light ? arLogoRev : arLogo) : light ? enLogoRev : enLogo
  return <img className="brandlogo" src={src} height={height} alt="Scoop360" />
}
export const logoDark = { en: enLogo, ar: arLogo }

/** First word Bold, the rest Light (brand two-weight heading). */
export const TwoWeight = ({ text }: { text: string }) => {
  const i = text.search(/\s/)
  if (i < 0) return <>{text}</>
  return <><b>{text.slice(0, i)}</b>{' '}<span className="lt">{text.slice(i + 1)}</span></>
}

/** Connected dots: posts, accounts and the links between them. Mostly teal, a few orange. Decorative, navy backgrounds only. */
export const GridPattern = ({ seed = 7, n = 26 }: { seed?: number; n?: number }) => {
  let x = seed * 9301 + 49297; const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280)
  const pts = Array.from({ length: n }, () => ({ x: 4 + rnd() * 92, y: 4 + rnd() * 92, o: rnd() > 0.88 }))
  const lines: [number, number][] = []
  pts.forEach((a, i) => pts.forEach((b, j) => { if (j > i && Math.hypot(a.x - b.x, a.y - b.y) < 20) lines.push([i, j]) }))
  return (
    <svg className="gridpat" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {lines.map(([i, j]) => <line key={i + '-' + j} x1={pts[i].x} y1={pts[i].y} x2={pts[j].x} y2={pts[j].y} stroke="#2EC4B6" strokeOpacity=".16" strokeWidth=".25" />)}
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.o ? 1.1 : 0.7} fill={p.o ? '#FF6B35' : '#2EC4B6'} fillOpacity={p.o ? 0.9 : 0.5} />)}
    </svg>
  )
}
export const Field = ({ label, children, error }: { label: string; children: ReactNode; error?: string }) => (
  <div className="field"><label>{label}</label>{children}{error && <div className="err" style={{ margin: '2px 0 0' }}>{error}</div>}</div>
)
export const Sent = ({ s }: { s: Post['sentiment'] }) => { const { t } = useApp(); return <span className={'tag ' + s}>{t(s[0].toUpperCase() + s.slice(1))}</span> }
export const PostRow = ({ p }: { p: Post }) => {
  const { lang, t } = useApp()
  return (
    <div className="post" style={{ cursor: 'pointer' }} onClick={() => window.dispatchEvent(new CustomEvent('lens-open-post', { detail: p }))}>
      <div className="pav">{p.author.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</div>
      <div style={{ flex: 1 }}>
        <div className="meta"><span><b>{p.author}</b> <span className="muted">· {p.source} · {ago(p.ts, lang)}</span></span><span>{p.handled && <span className="tag positive" style={{ marginInlineEnd: 6 }}>✓</span>}{p.urgent && <span className="tag warn" style={{ marginInlineEnd: 6 }}>{t('Urgent')}</span>}<Sent s={p.sentiment} /></span></div>
        <p>{p.text}</p><small>{p.reach ? `${t('Reach')} ${fmt(p.reach)} · ` : ''}{fmt(p.reactions)} {t('reactions')}</small>
      </div>
    </div>
  )
}
export const SentimentBars = ({ posts, days = 7 }: { posts: Post[]; days?: number }) => {
  const dayMs = 86400000, start = new Date(); start.setHours(0, 0, 0, 0)
  const cols = Array.from({ length: days }, (_, i) => { const d0 = start.getTime() - (days - 1 - i) * dayMs
    const inDay = posts.filter((p) => p.ts >= d0 && p.ts < d0 + dayMs)
    return { label: new Date(d0).toLocaleDateString('en', { weekday: 'narrow' }), pos: inDay.filter((p) => p.sentiment === 'positive').length, neu: inDay.filter((p) => p.sentiment === 'neutral').length, neg: inDay.filter((p) => p.sentiment === 'negative').length } })
  const max = Math.max(1, ...cols.map((c) => c.pos + c.neu + c.neg))
  return (
    <div className="bars">{cols.map((c, i) => (
      <div className="bar" key={i}><div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '88%', gap: 2 }}>
        <span style={{ height: `${(c.neg / max) * 100}%`, background: 'var(--err)' }} /><span style={{ height: `${(c.neu / max) * 100}%`, background: 'var(--neu)' }} /><span style={{ height: `${(c.pos / max) * 100}%`, background: 'var(--ok)' }} /></div><em>{c.label}</em></div>))}</div>
  )
}
export const Meter = ({ label, value, color = 'var(--navy)' }: { label: string; value: number; color?: string }) => (
  <div><div className="row2"><span>{label}</span><b>{value}%</b></div><div className="meter"><i style={{ width: value + '%', background: color }} /></div></div>
)
export const Empty = () => { const { t } = useApp(); return <div className="empty"><h2>{t('No posts yet')}</h2><p>{t('Add posts or load demo data to see Scoop360 work.')}</p></div> }
export const sentimentStats = (ps: Post[]) => {
  const n = ps.length || 1
  return { total: ps.length, reach: ps.reduce((a, p) => a + p.reach, 0), pos: Math.round((ps.filter((p) => p.sentiment === 'positive').length / n) * 100), neg: Math.round((ps.filter((p) => p.sentiment === 'negative').length / n) * 100) }
}
const ic = { size: 18, strokeWidth: 1.75 }
export const ICONS: Record<string, ReactNode> = {
  overview: <LayoutDashboard {...ic} />, name: <MessageSquareText {...ic} />, field: <TrendingUp {...ic} />, peer: <Users {...ic} />,
  alerts: <Bell {...ic} />, reports: <FileText {...ic} />, ask: <Sparkles {...ic} />, settings: <Settings {...ic} />,
}
