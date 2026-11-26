import type { ReactNode } from 'react'
import { Bell, Gem, FileText, LayoutDashboard, MessageSquareText, Settings, Sparkles, TrendingUp, Users } from 'lucide-react'
import enLogo from './assets/logo-en.svg'
import enLogoRev from './assets/logo-en-reversed.svg'
import arLogo from './assets/logo-ar.svg'
import arLogoRev from './assets/logo-ar-reversed.svg'
import markDark from './assets/mark.svg'
import markLight from './assets/mark-reversed.svg'
import type { Post } from './types'
import { ago, fmt } from './nlp'
import { useApp } from './store'

/** LENS logo. Arabic lockup in Arabic, English otherwise; reversed (white) version on navy. */
export const Logo = ({ light = true, mark = false, height = 34 }: { light?: boolean; mark?: boolean; height?: number }) => {
  const { lang } = useApp()
  const src = mark ? (light ? markLight : markDark) : lang === 'ar' ? (light ? arLogoRev : arLogo) : light ? enLogoRev : enLogo
  return <img className="brandlogo" src={src} height={height} alt="LENS" />
}
export const logoDark = { en: enLogo, ar: arLogo }

/** First word Bold, the rest Light (brand two-weight heading). */
export const TwoWeight = ({ text }: { text: string }) => {
  const i = text.search(/\s/)
  if (i < 0) return <>{text}</>
  return <><b>{text.slice(0, i)}</b>{' '}<span className="lt">{text.slice(i + 1)}</span></>
}

/** Focus field: fine concentric arcs from the symbol's centre with one glowing focal point. Dark backgrounds and covers only, low density. */
export const FocusField = ({ cx = 78, cy = 30, rings = 11 }: { cx?: number; cy?: number; rings?: number; seed?: number; n?: number }) => (
  <svg className="focusfield" viewBox="0 0 100 100" preserveAspectRatio="xMaxYMin slice" aria-hidden="true">
    <defs><radialGradient id="ffg"><stop offset="0" stopColor="#38C6FF" stopOpacity=".9" /><stop offset="1" stopColor="#38C6FF" stopOpacity="0" /></radialGradient></defs>
    {Array.from({ length: rings }, (_, i) => { const r = 9 + i * 8.5; return <path key={i} d={`M${cx - r} ${cy} A${r} ${r} 0 0 0 ${cx} ${cy + r}`} fill="none" stroke="#38C6FF" strokeWidth=".18" strokeOpacity={Math.max(0.05, 0.32 - i * 0.027)} /> })}
    <circle cx={cx} cy={cy} r="7" fill="url(#ffg)" opacity=".35" /><circle cx={cx} cy={cy} r="1.3" fill="#38C6FF" />
  </svg>
)
export const GridPattern = FocusField
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
export const Empty = () => { const { t } = useApp(); return <div className="empty"><h2>{t('No posts yet')}</h2><p>{t('Add posts or load demo data to see LENS work.')}</p></div> }
export const sentimentStats = (ps: Post[]) => {
  const n = ps.length || 1
  return { total: ps.length, reach: ps.reduce((a, p) => a + p.reach, 0), pos: Math.round((ps.filter((p) => p.sentiment === 'positive').length / n) * 100), neg: Math.round((ps.filter((p) => p.sentiment === 'negative').length / n) * 100) }
}
const ic = { size: 18, strokeWidth: 1.75 }
export const ICONS: Record<string, ReactNode> = {
  overview: <LayoutDashboard {...ic} />, name: <MessageSquareText {...ic} />, field: <TrendingUp {...ic} />, peer: <Users {...ic} />,
  alerts: <Bell {...ic} />, reports: <FileText {...ic} />, ask: <Sparkles {...ic} />, settings: <Settings {...ic} />, plans: <Gem {...ic} />,
}
