import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock, Sparkles, Check } from 'lucide-react'
import { backend } from './backend'
import { useApp } from './store'
import { suggestPeersAI } from './ai'
import { dayBrief, growthActions, suggestPeers, type Suggestion } from './insights'
import { PLANS, PLAN_ORDER, can, planOf } from './plans'
import type { Plan } from './types'

export const Locked = ({ need, title, text }: { need: Plan; title: string; text: string }) => {
  const { t } = useApp()
  return (
    <div className="card locked"><div className="row" style={{ gap: 8 }}><Lock size={16} /><h2>{t(title)}</h2><span className="tag">{t(planName[need])}</span></div>
      <p className="muted" style={{ margin: '8px 0 14px' }}>{t(text)}</p><Link className="btn coral" to="/plans">{t('See plans')}</Link></div>
  )
}
export const planName: Record<Plan, string> = { basic: 'Basic', pro: 'Pro', business: 'Business' }

/** Rivals for companies, similar creators for individuals. Pro and above. */
export function PeerSuggestions() {
  const { t, lang, wsId, profile, posts, peers, ai, canWrite } = useApp()
  const indiv = profile?.accountType === 'individual'
  const title = indiv ? 'Similar creators to watch' : 'Suggested competitors'
  const local = useMemo(() => suggestPeers(profile, posts, peers, lang === 'ar'), [profile, posts, peers, lang])
  const [aiList, setAiList] = useState<Suggestion[] | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  if (!can.suggestPeers(profile?.plan)) return <Locked need="pro" title={title} text={indiv ? 'Pro finds creators like you, so you can see what they publish and how it lands.' : 'Pro suggests competitors for your market so you do not have to guess who to watch.'} />
  const list = (aiList || local).filter((s) => !peers.some((p) => p.name.toLowerCase() === s.name.toLowerCase()))
  const refine = async () => { setBusy(true); setErr(''); try { setAiList(await suggestPeersAI(ai, profile, peers, lang)) } catch (e: any) { setErr(String(e?.message || e)) } setBusy(false) }
  const add = async (s: Suggestion) => { if (wsId) await backend.add(wsId, 'peers', { name: s.name, links: {} }) }
  return (
    <div className="card"><div className="head" style={{ marginBottom: 8 }}><h2>{t(title)}</h2>{ai.provider !== 'none' && <button className="btn ghost small" disabled={busy} onClick={refine}><Sparkles size={14} /> {busy ? t('Thinking…') : t('Suggest with AI')}</button>}</div>
      {err && <div className="err">{err}</div>}
      {list.length ? list.map((s) => <div className="row2" key={s.name} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)', gap: 12 }}>
        <div><b>{s.name}</b><div className="muted" style={{ fontSize: 12 }}>{s.why}</div></div>{canWrite && <button className="btn ghost small" onClick={() => add(s)}>{t('Follow')}</button>}</div>)
        : <p className="muted">{t('Add topics and collect posts first, or turn on AI in Settings, and suggestions will appear here.')}</p>}
    </div>
  )
}

/** What to do next, each with the data behind it. Business plan. */
export function GrowthActions() {
  const { t, lang, profile, posts, peers } = useApp()
  if (!can.growth(profile?.plan)) return <Locked need="business" title="What to do next" text="Business turns what we hear into next steps, each one with the numbers that justify it." />
  const acts = growthActions(profile, posts, peers, lang === 'ar')
  return (
    <div className="card"><h2 style={{ marginBottom: 8 }}>{t('What to do next')}</h2>
      {acts.length ? acts.map((a, i) => <div className="next" key={i} style={{ margin: '8px 0' }}><b>{a.title}</b><div className="muted" style={{ fontSize: 14 }}>{a.why}</div></div>)
        : <p className="muted">{t('Not enough data yet. Collect posts and the next steps will show up here.')}</p>}
    </div>
  )
}

/** For creators and public figures who have no time: the day in four lines. */
export function DayBrief() {
  const { t, lang, profile, posts } = useApp()
  if (profile?.accountType !== 'individual') return null
  const lines = dayBrief(profile, posts, lang === 'ar')
  return <div className="card" style={{ marginBottom: 18 }}><h2 style={{ marginBottom: 8 }}>{t('Your day in brief')}</h2>{lines.map((l, i) => <p key={i} style={{ margin: '6px 0' }}>{l}</p>)}</div>
}

export function PlansPage() {
  const { t, profile, saveProfile, canAdmin } = useApp()
  const cur = profile?.plan || 'basic'
  const company = profile?.accountType === 'company'
  return (<>
    <div className="head"><div><div className="eyebrow">{t(company ? 'For companies watching a market' : 'For creators and public figures').toUpperCase()}</div><h1>{t('Plans')}</h1></div></div>
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
      {PLANS.map((p) => <div className={'card plan' + (p.id === cur ? ' current' : '')} key={p.id}>
        <div className="row2"><h2>{t(planName[p.id])}</h2>{p.id === cur && <span className="tag positive">{t('Your plan')}</span>}</div>
        <ul className="planlist">{p.features.map((f) => <li key={f}><Check size={16} /> <span>{t(f)}</span></li>)}</ul>
        {p.id !== cur && canAdmin && <button className={'btn' + (PLAN_ORDER.indexOf(p.id) > PLAN_ORDER.indexOf(cur) ? ' coral' : ' ghost')} onClick={() => saveProfile({ plan: p.id })}>{PLAN_ORDER.indexOf(p.id) > PLAN_ORDER.indexOf(cur) ? t('Upgrade') : t('Switch')}</button>}
      </div>)}
    </div>
    <p className="muted" style={{ marginTop: 16 }}>{t('Billing is not connected yet, so changing plan is instant and free.')} {planOf(cur).peers < 999 && `${t('Your plan allows')} ${planOf(cur).peers} ${t('rivals and')} ${planOf(cur).topics} ${t('topics.')}`}</p>
  </>)
}
