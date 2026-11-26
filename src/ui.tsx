import type { ReactNode } from 'react'
import markUrl from './assets/logo-mark.svg'
import type { Post } from './types'
import { ago, fmt } from './nlp'
import { useApp } from './store'

export const Logo = ({ light = true }: { light?: boolean }) => (
  <div className="logo" style={{ color: light ? '#fff' : 'var(--navy)' }}>
    <img src={markUrl} width="28" height="28" alt="" />LENS
  </div>
)
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
export const ICONS: Record<string, ReactNode> = {
  overview: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/></svg>,
  name: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 4h12v9H9l-4 3v-3H4z"/></svg>,
  field: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 14l5-5 3 3 6-6M13 6h4v4"/></svg>,
  peer: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7.5" cy="10" r="4.5"/><circle cx="12.5" cy="10" r="4.5"/></svg>,
  alerts: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 14V9a5 5 0 0 1 10 0v5l1.5 2h-13zM8 17a2 2 0 0 0 4 0"/></svg>,
  reports: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 2h7l4 4v12H5zM12 2v4h4M8 11h5M8 14h5"/></svg>,
  ask: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="9" r="5.5"/><path d="M13 13l4 4"/></svg>,
  settings: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 6h9M15 6h2M3 14h2M8 14h9"/><circle cx="13" cy="6" r="2"/><circle cx="6" cy="14" r="2"/></svg>,
}
