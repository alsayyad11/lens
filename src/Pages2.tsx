import { useEffect, useState } from 'react'
import { backend } from './backend'
import { draftLocalAI } from './ai'
import { useApp } from './store'
import { Field, Sent } from './ui'
import { ago, fmt } from './nlp'
import { llm } from './llm'
import { toCfg } from './ai'
import { EMPTY_AI, EMPTY_SOURCES, ROLES, SOURCES, type Post, type AiProvider, type AiSettings, type Role, type Source, type SourcesConfig } from './types'
import { SeedButtons } from './Pages'

/* ---------- collect now (Cloud Functions) ---------- */
export function useCollect() {
  const { wsId, t } = useApp()
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  const run = async () => {
    setBusy(true); setMsg('')
    try { const r = await backend.call<{ added: number }>('collectNow', { wsId }); setMsg(`+${r.added}`) }
    catch (e: any) { setMsg(e?.code === 'local-mode' ? t('Cloud collection needs Firebase and the deployed functions.') : (e?.message || 'Failed')) }
    setBusy(false)
  }
  return { run, busy, msg }
}
export function CollectButton() {
  const { t, canWrite } = useApp(); const c = useCollect()
  if (!canWrite) return null
  return <><button className="btn ghost" disabled={c.busy} onClick={c.run}>{c.busy ? '…' : t('Collect now')}</button>{c.msg && <span className="muted" style={{ fontSize: 12 }}>{c.msg}</span>}</>
}

/* ---------- mention detail (opens from any post row) ---------- */
export function MentionHost() {
  const { t, lang, profile, wsId, canWrite, ai } = useApp()
  const [p, setP] = useState<Post | null>(null), [draft, setDraft] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { const f = (e: any) => { setP(e.detail); setDraft('') }; window.addEventListener('lens-open-post', f); return () => window.removeEventListener('lens-open-post', f) }, [])
  if (!p) return null
  const brand = profile?.orgName || ''
  const local = () => lang === 'ar'
    ? (p.sentiment === 'negative' ? `أهلاً ${p.author}، نعتذر عن التجربة. نحب نصلّح الموضوع، من فضلك ابعتلنا التفاصيل على الرسائل الخاصة وهنتواصل معاك فوراً. فريق ${brand}` : `شكراً ${p.author} على كلامك الحلو! فريق ${brand}`)
    : (p.sentiment === 'negative' ? `Hi ${p.author}, we are sorry about this. We want to make it right. Please send us the details in a private message and we will follow up right away. The ${brand} team` : `Thank you ${p.author}, that means a lot to us! The ${brand} team`)
  const make = async () => { setBusy(true); try { const r = await backend.call<{ reply: string }>('draftReply', { wsId, text: p.text, author: p.author, source: p.source, sentiment: p.sentiment, brand, lang }); setDraft(r.reply) } catch { try { if (ai.provider === 'none') throw new Error('off'); setDraft(await draftLocalAI(ai, p, brand, lang)) } catch { setDraft(local()) } } setBusy(false) }
  return (
    <div className="modal" onClick={() => setP(null)}><div className="card" onClick={(e) => e.stopPropagation()}>
      <div className="head" style={{ marginBottom: 8 }}><div><div className="eyebrow">{p.source} · {ago(p.ts, lang)}</div><h2 style={{ fontSize: 20 }}>{p.author}</h2></div><div className="row"><Sent s={p.sentiment} />{p.urgent && <span className="tag warn">{t('Urgent')}</span>}</div></div>
      <p style={{ fontSize: 16, margin: '8px 0 14px' }} dir="auto">{p.text}</p>
      {p.summary && <p className="muted" style={{ marginBottom: 10 }}>{p.summary}</p>}
      <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>{t('Reach')} {fmt(p.reach)} · {fmt(p.reactions)} {t('reactions')}{p.topics?.length ? ' · ' + p.topics.join(', ') : ''}{p.url && <> · <a href={p.url} target="_blank" rel="noreferrer">{t('See the thread')}</a></>}</div>
      {draft && <textarea value={draft} onChange={(e) => setDraft(e.target.value)} dir="auto" style={{ marginBottom: 12 }} />}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canWrite && <button className="btn coral" disabled={busy} onClick={make}>{busy ? '…' : t('Draft a reply')}</button>}
        {draft && <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(draft)}>{t('Copy')}</button>}
        {canWrite && <button className="btn ghost" onClick={async () => { await backend.update(wsId, 'posts', p.id, { handled: !p.handled }); setP({ ...p, handled: !p.handled }) }}>{p.handled ? t('Mark as open') : t('Mark as handled')}</button>}
        <span style={{ flex: 1 }} /><button className="btn ghost" onClick={() => setP(null)}>{t('Close')}</button>
      </div></div></div>
  )
}

/* ---------- your pages (Figma 5.3) ---------- */
export function YourPages() {
  const { t, wsId, pages, canWrite } = useApp()
  const [f, setF] = useState({ platform: 'Facebook' as Source, name: '', url: '' })
  return (
    <div className="card" style={{ marginTop: 18 }}><h2 style={{ marginBottom: 12 }}>{t('Your pages')}</h2>
      {pages.length > 0 && <table><tbody>{pages.map((p) => <tr key={p.id}><td><b>{p.name}</b></td><td>{p.platform}</td><td><a href={p.url} target="_blank" rel="noreferrer">{p.url}</a></td><td>{canWrite && <button className="btn ghost small" onClick={() => backend.remove(wsId, 'pages', p.id)}>{t('Delete')}</button>}</td></tr>)}</tbody></table>}
      {canWrite && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 2fr auto', gap: 8, marginTop: 14 }}>
        <select value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value as Source })}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
        <input placeholder={t('Page name')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input placeholder="https://" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
        <button className="btn" onClick={async () => { if (!f.name.trim()) return; await backend.add(wsId, 'pages', f); setF({ ...f, name: '', url: '' }) }}>{t('Add')}</button></div>}
    </div>
  )
}

/* ---------- team and roles (Figma 9.2) ---------- */
function Team() {
  const { t, wsId, members, profile, user, canAdmin, role, myName } = useApp()
  const [f, setF] = useState({ email: '', name: '', role: 'analyst' as Role }), [err, setErr] = useState('')
  const roles = ROLES.filter((r) => r !== 'owner')
  const invite = async () => {
    const email = f.email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Invalid email.')
    if (members.some((m) => m.email.toLowerCase() === email) || email === user?.email.toLowerCase()) return setErr(t('This person is already on the team.'))
    setErr(''); await backend.add(wsId, 'members', { email, name: f.name.trim() || email, role: f.role, status: 'invited' })
    await backend.setMembership(email, { ownerUid: wsId, role: f.role, name: f.name.trim() || email }); setF({ email: '', name: '', role: 'analyst' })
  }
  const desc: Record<string, string> = { owner: 'Everything, including billing and deleting the workspace', admin: 'Manage team, sources and alerts', analyst: 'Add posts, create alerts, draft replies', viewer: 'Read only' }
  return (<>
    <div className="card"><h2 style={{ marginBottom: 12 }}>{t('Team and roles')}</h2>
      <table><thead><tr><th>{t('Full name')}</th><th>{t('Email')}</th><th>Role</th><th /></tr></thead><tbody>
        <tr><td><b>{role === 'owner' ? myName : profile?.fullName}</b></td><td>{role === 'owner' ? user?.email : ''}</td><td><span className="tag">owner</span></td><td /></tr>
        {members.map((m) => <tr key={m.id}><td>{m.name}</td><td>{m.email}</td>
          <td>{canAdmin ? <select value={m.role} style={{ padding: '6px 10px' }} onChange={async (e) => { await backend.update(wsId, 'members', m.id, { role: e.target.value }); await backend.setMembership(m.email, { ownerUid: wsId, role: e.target.value as Role, name: m.name }) }}>{roles.map((r) => <option key={r}>{r}</option>)}</select> : <span className="tag">{m.role}</span>} <span className={'tag ' + (m.status === 'active' ? 'positive' : 'warn')}>{m.status === 'active' ? t('Active') : t('Invited')}</span></td>
          <td>{canAdmin && <button className="btn ghost small" onClick={async () => { await backend.remove(wsId, 'members', m.id); await backend.removeMembership(m.email) }}>{t('Delete')}</button>}</td></tr>)}</tbody></table>
      <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>{roles.map((r) => <div key={r}><b>{r}</b>: {desc[r]}</div>)}</div></div>
    {canAdmin && <div className="card" style={{ marginTop: 18 }}><h2 style={{ marginBottom: 12 }}>{t('Invite a teammate')}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 150px auto', gap: 8 }}>
        <input placeholder={t('Email')} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /><input placeholder={t('Full name')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{roles.map((r) => <option key={r}>{r}</option>)}</select><button className="btn coral" onClick={invite}>{t('Invite')}</button></div>
      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>{t('They join by creating an account with this exact email, then they land in this workspace.')}</p></div>}
  </>)
}

/* ---------- sources (Figma 9.3, 9.4) ---------- */
function Sources() {
  const { t, wsId, sources, canAdmin, lang } = useApp(); const c = useCollect()
  const [cfg, setCfg] = useState<SourcesConfig>({ ...EMPTY_SOURCES, ...sources }), [feed, setFeed] = useState(''), [saved, setSaved] = useState(false)
  useEffect(() => { setCfg((o) => ({ ...o, status: sources.status })) }, [sources.status])
  useEffect(() => { setCfg({ ...EMPTY_SOURCES, ...sources }) }, [wsId]) // eslint-disable-line
  const save = async () => { const { status, ...rest } = cfg; void status; await backend.setPrivate(wsId, 'sources', rest); setSaved(true); setTimeout(() => setSaved(false), 1800) }
  const st = (k: string) => { const s = sources.status?.[k]; return s ? <span className={'tag ' + (s.state === 'ok' ? 'positive' : s.state === 'failed' ? 'negative' : '')}>{s.state === 'ok' ? `${t('Connected')} · ${s.count ?? 0}` : s.state === 'failed' ? t('Failed') : t('Idle')}{s.last ? ` · ${ago(s.last, lang)}` : ''}</span> : <span className="tag">{t('Not connected')}</span> }
  const fail = (k: string) => sources.status?.[k]?.state === 'failed' && <div className="err" style={{ margin: '8px 0 0' }}>{sources.status[k].message}</div>
  const Row = ({ k, title, hint, children, on, set }: any) => (
    <div className="card" style={{ marginBottom: 14 }}><div className="head" style={{ marginBottom: 6 }}><div><h2>{title}</h2><div className="muted" style={{ fontSize: 12 }}>{hint}</div></div><div className="row">{st(k)}<label className="pill" style={{ cursor: 'pointer' }}><input type="checkbox" style={{ width: 'auto', marginInlineEnd: 6 }} checked={on} disabled={!canAdmin} onChange={(e) => set(e.target.checked)} />{t('Enabled')}</label></div></div>{on && children}{fail(k)}</div>)
  if (!canAdmin) return <div className="card"><p className="muted">{t('Only owners and admins can manage sources.')}</p></div>
  return (<>
    <div className="head" style={{ marginBottom: 14 }}><p className="muted" style={{ maxWidth: 620 }}>{t('LENS collects from these sources every 30 minutes, and on demand. Keys are stored in your private workspace settings.')}</p><div className="row"><button className="btn ghost" disabled={c.busy} onClick={c.run}>{c.busy ? '…' : t('Collect now')}</button><button className="btn coral" onClick={save}>{saved ? '✓' : t('Save')}</button></div></div>
    {c.msg && <div className="banner">{c.msg}</div>}
    <Row k="news" title="News (Google News)" hint={t('Searches your names, topics and peers. No key needed.')} on={cfg.news.enabled} set={(v: boolean) => setCfg({ ...cfg, news: { enabled: v } })} />
    <Row k="bing" title="News (Bing News)" hint={t('A second news index, free, no key.')} on={cfg.bing.enabled} set={(v: boolean) => setCfg({ ...cfg, bing: { enabled: v } })} />
    <Row k="reddit" title="Reddit" hint={t('Public Reddit search. Free, no key. Reddit may block some servers; the status shows it.')} on={cfg.reddit.enabled} set={(v: boolean) => setCfg({ ...cfg, reddit: { enabled: v } })} />
    <Row k="mastodon" title="Mastodon" hint={t('Public hashtag timelines. Free, no key.')} on={cfg.mastodon.enabled} set={(v: boolean) => setCfg({ ...cfg, mastodon: { enabled: v } })} />
    <Row k="gdelt" title="GDELT (global news)" hint={t('News from around the world, free. Slow: one request every 5 seconds.')} on={cfg.gdelt.enabled} set={(v: boolean) => setCfg({ ...cfg, gdelt: { enabled: v } })} />
    <Row k="hackernews" title="Hacker News" hint={t('Tech stories and comments, free. Best for technology topics.')} on={cfg.hackernews.enabled} set={(v: boolean) => setCfg({ ...cfg, hackernews: { enabled: v } })} />
    <Row k="blogs" title="Blogs and sites (RSS)" hint={t('Add RSS or Atom feeds of blogs and news sites to read.')} on={cfg.blogs.enabled} set={(v: boolean) => setCfg({ ...cfg, blogs: { ...cfg.blogs, enabled: v } })}>
      {cfg.blogs.feeds.map((u) => <span className="chip" key={u}>{u}<button onClick={() => setCfg({ ...cfg, blogs: { ...cfg.blogs, feeds: cfg.blogs.feeds.filter((z) => z !== u) } })}>×</button></span>)}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><input placeholder="https://example.com/feed" value={feed} onChange={(e) => setFeed(e.target.value)} /><button className="btn" onClick={() => { const v = feed.trim(); if (v) setCfg({ ...cfg, blogs: { ...cfg.blogs, feeds: [...cfg.blogs.feeds, v] } }); setFeed('') }}>{t('Add')}</button></div></Row>
    <Row k="x" title="X (Twitter)" hint={t('Needs an X API bearer token with recent search access.')} on={cfg.x.enabled} set={(v: boolean) => setCfg({ ...cfg, x: { ...cfg.x, enabled: v } })}>
      <Field label="Bearer token"><input type="password" value={cfg.x.bearer} onChange={(e) => setCfg({ ...cfg, x: { ...cfg.x, bearer: e.target.value } })} /></Field></Row>
    <Row k="facebook" title="Facebook Page" hint={t('Reads posts and comments on your own page. Needs a Page access token.')} on={cfg.facebook.enabled} set={(v: boolean) => setCfg({ ...cfg, facebook: { ...cfg.facebook, enabled: v } })}>
      <div className="grid" style={{ gridTemplateColumns: '1fr 2fr', gap: 10 }}><Field label="Page ID"><input value={cfg.facebook.pageId} onChange={(e) => setCfg({ ...cfg, facebook: { ...cfg.facebook, pageId: e.target.value } })} /></Field><Field label="Page access token"><input type="password" value={cfg.facebook.token} onChange={(e) => setCfg({ ...cfg, facebook: { ...cfg.facebook, token: e.target.value } })} /></Field></div></Row>
    <Row k="instagram" title="Instagram Business" hint={t('Reads media that tags your account. Needs an Instagram Business account and token.')} on={cfg.instagram.enabled} set={(v: boolean) => setCfg({ ...cfg, instagram: { ...cfg.instagram, enabled: v } })}>
      <div className="grid" style={{ gridTemplateColumns: '1fr 2fr', gap: 10 }}><Field label="Instagram user ID"><input value={cfg.instagram.userId} onChange={(e) => setCfg({ ...cfg, instagram: { ...cfg.instagram, userId: e.target.value } })} /></Field><Field label="Access token"><input type="password" value={cfg.instagram.token} onChange={(e) => setCfg({ ...cfg, instagram: { ...cfg.instagram, token: e.target.value } })} /></Field></div></Row>
    <div className="card"><h2>LinkedIn</h2><p className="muted" style={{ fontSize: 13 }}>{t('LinkedIn has no public API for mentions. Use Paste posts to bring LinkedIn posts in.')}</p></div>
  </>)
}


/* ---------- free AI providers ---------- */
const PROVIDERS: { id: AiProvider; label: string; free: string; link?: string; model: string }[] = [
  { id: 'none', label: 'Off (built-in rules only)', free: 'Nothing is sent to any AI service.', model: '' },
  { id: 'gemini', label: 'Google Gemini', free: 'Free tier with a Google account. Great Arabic.', link: 'https://aistudio.google.com/apikey', model: 'gemini-flash-latest' },
  { id: 'groq', label: 'Groq (Llama)', free: 'Free tier, very fast.', link: 'https://console.groq.com/keys', model: 'llama-3.3-70b-versatile' },
  { id: 'openrouter', label: 'OpenRouter (free models)', free: 'Free models, shared limits.', link: 'https://openrouter.ai/keys', model: 'meta-llama/llama-3.3-70b-instruct:free' },
  { id: 'keyless', label: 'No key (best effort)', free: 'Public endpoint with no account. Can be slow or unavailable. Your mentions are sent to it.', model: 'openai' },
  { id: 'anthropic', label: 'Claude (paid)', free: 'Best quality. Paid API key.', link: 'https://console.anthropic.com/settings/keys', model: 'claude-haiku-5-5' },
]
function AiTab() {
  const { t, wsId, ai, canAdmin } = useApp()
  const [f, setF] = useState<AiSettings>({ ...EMPTY_AI, ...ai }), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null), [busy, setBusy] = useState(false)
  useEffect(() => { setF({ ...EMPTY_AI, ...ai }) }, [ai.provider, ai.key, ai.model]) // eslint-disable-line
  if (!canAdmin) return <div className="card"><p className="muted">{t('Only owners and admins can manage AI settings.')}</p></div>
  const cur = PROVIDERS.find((p) => p.id === f.provider)!
  const save = async () => { await backend.setPrivate(wsId, 'ai', f); setMsg({ ok: true, text: t('Saved') }) }
  const test = async () => {
    setBusy(true); setMsg(null)
    try { const cfg = toCfg(f); if (!cfg) throw new Error(t('Choose a provider first.')); const r = await llm(cfg, 'Reply with the single word OK.', 'ping', 20); setMsg({ ok: true, text: `${t('Works')}: ${r.trim().slice(0, 40)}` }) }
    catch (e: any) { setMsg({ ok: false, text: String(e?.message || e).slice(0, 220) }) }
    setBusy(false)
  }
  return (
    <div className="grid g2"><div className="card">
      <h2 style={{ marginBottom: 6 }}>{t('AI provider')}</h2>
      <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>{t('Powers Ask LENS, reply drafts and the sentiment of collected posts. Pick a free provider and paste its key. Keys stay in your private workspace settings.')}</p>
      <Field label={t('Provider')}><select value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value as AiProvider })}>{PROVIDERS.map((p) => <option key={p.id} value={p.id}>{t(p.label)}</option>)}</select></Field>
      <p className="muted" style={{ fontSize: 13, margin: '-6px 0 14px' }}>{t(cur.free)} {cur.link && <a href={cur.link} target="_blank" rel="noreferrer">{t('Get a key')}</a>}</p>
      {!['none', 'keyless'].includes(f.provider) && <Field label={t('API key')}><input type="password" autoComplete="off" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} /></Field>}
      {f.provider !== 'none' && <Field label={t('Model (optional)')}><input placeholder={cur.model} value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></Field>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><button className="btn coral" onClick={save}>{t('Save')}</button><button className="btn ghost" disabled={busy || f.provider === 'none'} onClick={test}>{busy ? '…' : t('Test connection')}</button>{msg && <span className={msg.ok ? 'ok' : 'err'} style={{ margin: 0 }}>{msg.text}</span>}</div>
    </div>
    <div className="card"><h2 style={{ marginBottom: 10 }}>{t('How it is used')}</h2>
      <p className="muted" style={{ fontSize: 13 }}>{t('If the chosen provider fails, LENS tries the no-key endpoint, then falls back to built-in rules, so the chatbot always answers.')}</p></div></div>
  )
}

/* ---------- settings with tabs (Figma 9.1 and B6) ---------- */
export function SettingsPage() {
  const { t, user, profile, lang, setLang, theme, setTheme, role, canAdmin } = useApp()
  const company = profile?.accountType === 'company'
  const [tab, setTab] = useState<'account' | 'team' | 'sources' | 'ai'>('account')
  return (<>
    <div className="head"><div><h1>{t('Settings')}</h1></div><div className="row"><button className={'pill' + (tab === 'account' ? ' on' : '')} onClick={() => setTab('account')}>{t('Account')}</button>
      {company && <button className={'pill' + (tab === 'team' ? ' on' : '')} onClick={() => setTab('team')}>{t('Team and roles')}</button>}
      {canAdmin && <button className={'pill' + (tab === 'sources' ? ' on' : '')} onClick={() => setTab('sources')}>{t('Sources')}</button>}
      {canAdmin && <button className={'pill' + (tab === 'ai' ? ' on' : '')} onClick={() => setTab('ai')}>{t('AI')}</button>}</div></div>
    {tab === 'account' && <div className="grid g2"><div className="card"><h2 style={{ marginBottom: 14 }}>{t('Account')}</h2>
      <table><tbody><tr><td>{t('Email')}</td><td>{user?.email}</td></tr><tr><td>{t('Workspace')}</td><td>{profile?.orgName} <span className="tag">{role}</span></td></tr>
        <tr><td>{t('Account type')}</td><td><span className="tag">{company ? 'B2B · ' + t('A company') : 'B2C · ' + t('Just me')}</span></td></tr>
        <tr><td>{t('Language')}</td><td><button className="pill" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>{lang === 'en' ? 'العربية' : 'English'}</button></td></tr>
        <tr><td>{t('Theme')}</td><td><button className="pill" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? t('Light') : t('Dark')}</button></td></tr></tbody></table></div>
      <div className="card"><h2 style={{ marginBottom: 8 }}>{t('Workspace')}</h2><p className="muted" style={{ marginBottom: 12 }}>{t('Add posts or load demo data to see LENS work.')}</p><SeedButtons /></div></div>}
    {tab === 'team' && company && <Team />}
    {tab === 'sources' && <Sources />}
    {tab === 'ai' && <AiTab />}
  </>)
}
