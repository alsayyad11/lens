import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { backend } from './backend'
import { askLocalAI } from './ai'
import { useApp } from './store'
import { classify, demoPosts, fmt, matchesAny, topWords } from './nlp'
import { Empty, Field, Meter, PostRow, SentimentBars, GridPattern, TwoWeight, logoDark, sentimentStats } from './ui'
import { CollectButton, YourPages } from './Pages2'
import { DayBrief, GrowthActions, PeerSuggestions } from './Pages3'
import { can, planOf } from './plans'
import { Delta, Donut, TopVoices, TrendChart } from './Dash'
import { SOURCES, type AlertRule, type Lens, type Post, type Source } from './types'

const DAY = 86400000
type Range = 1 | 7 | 30
const useRange = () => { const [r, setR] = useState<Range>(7); return [r, setR] as const }
const inRange = (ps: Post[], r: Range) => ps.filter((p) => p.ts >= Date.now() - r * DAY)
const RangePills = ({ r, set }: { r: Range; set: (r: Range) => void }) => { const { t } = useApp(); return <>{([1, 7, 30] as Range[]).map((x) => <button key={x} className={'pill' + (r === x ? ' on' : '')} onClick={() => set(x)}>{t(x === 1 ? 'Today' : x === 7 ? '7 days' : '30 days')}</button>)}</> }
const Head = ({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) => <div className="head"><div><div className="eyebrow">{eyebrow}</div><h1><TwoWeight text={title} /></h1></div><div className="row">{children}</div></div>

/* ---------- shared: add a post / paste posts ---------- */
export function AddPost({ onClose, lens = 'name' }: { onClose: () => void; lens?: Lens }) {
  const { t, wsId, peers } = useApp()
  const [f, setF] = useState({ lens, author: '', source: 'X' as Source, text: '', peerId: peers[0]?.id || '', bulk: false })
  const save = async () => {
    if (!wsId || !f.text.trim()) return
    const texts = f.bulk ? f.text.split('\n').map((s) => s.trim()).filter(Boolean) : [f.text.trim()]
    const rows = texts.map((text) => ({ lens: f.lens, author: f.author.trim() || 'Anonymous', source: f.source, text, ...classify(text), reach: Math.round(200 + Math.random() * 5000), reactions: Math.round(Math.random() * 300), ts: Date.now() - Math.round(Math.random() * 3600000), ...(f.lens === 'peer' && f.peerId ? { peerId: f.peerId } : {}) }))
    await backend.addMany(wsId, 'posts', rows); onClose()
  }
  return (
    <div className="modal" onClick={onClose}><div className="card" onClick={(e) => e.stopPropagation()}>
      <h2 style={{ marginBottom: 16 }}>{f.bulk ? t('Paste posts') : t('Add a post')}</h2>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label={t('Which lens')}><select value={f.lens} onChange={(e) => setF({ ...f, lens: e.target.value as Lens })}><option value="name">{t('Name Lens')}</option><option value="field">{t('Field Lens')}</option><option value="peer">{t('Peer Lens')}</option></select></Field>
        <Field label={t('Source')}><select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as Source })}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></Field>
      </div>
      {f.lens === 'peer' && <Field label={t('Which peer')}><select value={f.peerId} onChange={(e) => setF({ ...f, peerId: e.target.value })}>{peers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
      {!f.bulk && <Field label={t('Author')}><input value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} /></Field>}
      <Field label={t('Text')}><textarea value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder={f.bulk ? 'One post per line' : ''} /></Field>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
        <button className="btn ghost small" onClick={() => setF({ ...f, bulk: !f.bulk })}>{f.bulk ? t('Add a post') : t('Paste posts')}</button>
        <div style={{ display: 'flex', gap: 8 }}><button className="btn ghost" onClick={onClose}>{t('Cancel')}</button><button className="btn coral" onClick={save}>{t('Save')}</button></div>
      </div>
    </div></div>
  )
}

/* ---------- Overview ---------- */
export function Overview() {
  const { t, profile, posts, peers, lang, canWrite } = useApp()
  const [r, setR] = useRange(); const [add, setAdd] = useState(false)
  const name = useMemo(() => inRange(posts.filter((p) => p.lens === 'name'), r), [posts, r])
  const all = inRange(posts, r)
  const st = sentimentStats(name)
  const urgent = name.filter((p) => p.urgent)
  const neg = name.filter((p) => p.sentiment === 'negative')
  const top = neg.sort((a, b) => b.reach - a.reach)[0]
  const fieldTop = topWords(inRange(posts.filter((p) => p.lens === 'field'), r).map((p) => p.text), 4)
  const peerVoice = voice(posts, peers, profile?.orgName || 'You', r)
  const prevName = posts.filter((p) => p.lens === 'name' && p.ts < Date.now() - r * DAY && p.ts >= Date.now() - 2 * r * DAY)
  const prevSt = sentimentStats(prevName), allIn = inRange(posts, r), queue = name.filter((p) => !p.handled && (p.urgent || p.sentiment === 'negative')).sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || b.reach - a.reach).slice(0, 4)
  const bySrc = SOURCES.map((s) => ({ s, n: allIn.filter((p) => p.source === s).length })).filter((x) => x.n).sort((a, b) => b.n - a.n)
  const hour = new Date().getHours()
  const greet = lang === 'ar' ? (hour < 12 ? 'صباح الخير' : 'مساء الخير') : hour < 12 ? 'Good morning' : 'Good afternoon'
  if (!posts.length) return <><Head eyebrow={new Date().toDateString().toUpperCase()} title={`${greet}, ${profile?.fullName.split(' ')[0] || ''}.`} /><div className="card"><Empty /><SeedButtons /><div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}><CollectButton /></div></div></>
  return (<>
    <Head eyebrow={`${new Date().toDateString().toUpperCase()} · ${t('What matters today')}`} title={`${greet}, ${profile?.fullName.split(' ')[0] || ''}.`}><RangePills r={r} set={setR} /><CollectButton />{canWrite && <button className="btn" onClick={() => setAdd(true)}>{t('Add a post')}</button>}</Head>
    <DayBrief />
    <div className="hero"><GridPattern seed={21} n={30} /><div><div className="eyebrow">{t('What matters today')}</div>
      <h2>{top ? (lang === 'ar' ? `أعلى إشارة سلبية: ${top.author} على ${top.source} بوصول ${fmt(top.reach)}. ردّ قبل أن تنتشر.` : `The top negative mention is from ${top.author} on ${top.source} (reach ${fmt(top.reach)}). Reply before it spreads.`) : lang === 'ar' ? 'لا إشارات سلبية في هذه الفترة. حافظ على الزخم.' : 'No negative mentions in this period. Keep the momentum.'}</h2>{top && <div style={{ display: 'flex', gap: 10 }}><button className="btn coral" onClick={() => window.dispatchEvent(new CustomEvent('lens-open-post', { detail: top }))}>{t('Draft a reply')}</button>{top.url && <a className="btn ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.5)', textDecoration: 'none' }} href={top.url} target="_blank" rel="noreferrer">{t('See the thread')}</a>}</div>}</div>
      <div className="kpi"><div><div className="eyebrow">{t('Mentions')}</div><b>{st.total}</b></div><div><div className="eyebrow">{t('Urgent')}</div><b>{urgent.length}</b></div><div><div className="eyebrow">{t('Positive')}</div><b>{st.pos}%</b></div></div></div>
    <div className="grid g4 stats" style={{ margin: '18px 0' }}>
      {[{ k: 'Mentions', v: String(st.total), d: <Delta cur={st.total} prev={prevSt.total} /> }, { k: 'Reach', v: fmt(st.reach), d: <Delta cur={st.reach} prev={prevSt.reach} /> }, { k: 'Positive', v: st.pos + '%', d: <Delta cur={st.pos} prev={prevSt.pos} /> }, { k: 'Negative', v: st.neg + '%', d: <Delta cur={st.neg} prev={prevSt.neg} goodWhenUp={false} /> }].map((c) => <div className="card" key={c.k}><div className="eyebrow">{t(c.k)}</div><span className="big">{c.v}</span><br />{c.d}</div>)}</div>
    <div className="grid g2" style={{ marginBottom: 18 }}>
      <div className="card"><div className="head" style={{ marginBottom: 6 }}><h2>{t('Trend')}</h2><span className="eyebrow">{t('Mentions')} · <span style={{ color: 'var(--err)' }}>{t('Negative')}</span></span></div><TrendChart posts={name} days={r === 1 ? 7 : Math.min(r, 30)} /></div>
      <div className="card"><h2 style={{ marginBottom: 14 }}>{t('Sentiment mix')}</h2><Donut posts={name} /></div></div>
    <div className="grid g3" style={{ marginBottom: 18 }}>
      <div className="card"><h2 style={{ marginBottom: 10 }}>{t('Needs a reply')}</h2>{queue.length ? queue.map((p) => <PostRow key={p.id} p={p} />) : <p className="muted">{t('Nothing urgent.')}</p>}</div>
      <div className="card"><h2 style={{ marginBottom: 10 }}>{t('By source')}</h2>{bySrc.length ? bySrc.map((x) => <Meter key={x.s} label={`${x.s} · ${x.n}`} value={Math.round((x.n / (allIn.length || 1)) * 100)} />) : <p className="muted">—</p>}</div>
      <div className="card"><h2 style={{ marginBottom: 10 }}>{t('Top voices')}</h2><TopVoices posts={allIn} /></div></div>
    <div className="card" style={{ padding: 0 }}><div className="grid g3" style={{ gap: 0 }}>
      <div style={{ padding: 22 }}><h2>{t('Name Lens')}</h2><div className="stats" style={{ margin: '12px 0' }}><span className="big">{st.total}</span> <span className="muted">{t('Mentions')}</span></div><SentimentBars posts={name} days={r === 1 ? 7 : Math.min(r, 14)} />{name.slice(0, 2).map((p) => <PostRow key={p.id} p={p} />)}</div>
      <div style={{ padding: 22, borderInlineStart: '1px solid var(--line)' }}><h2>{t('Field Lens')}</h2><div style={{ marginTop: 14 }}>{fieldTop.length ? fieldTop.map((w) => <div className="row2" key={w.word} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}><span>{w.word}</span><b>{w.count}</b></div>) : <p className="muted">—</p>}</div></div>
      <div style={{ padding: 22, borderInlineStart: '1px solid var(--line)' }}><h2>{t('Peer Lens')}</h2><div className="eyebrow" style={{ margin: '14px 0 10px' }}>{t('Share of voice')}</div>{peerVoice.map((v, i) => <Meter key={v.name} label={v.name} value={v.pct} color={['var(--navy)', 'var(--s2)', 'var(--neu)'][i % 3]} />)}</div></div></div>
    <h2 style={{ margin: '26px 0 12px' }}>{t('Do next')}</h2>
    <div className="grid g3">
      <div className="next"><span className="eyebrow">REPLY</span><h2>{top ? `${t('Reply')} ${top.author}` : '—'}</h2><p className="muted">{top?.text.slice(0, 90)}</p></div>
      <div className="next"><span className="eyebrow">CONTENT IDEA</span><h2>{fieldTop[0] ? `${t('Post about')} ${fieldTop[0].word}` : '—'}</h2><p className="muted">{lang === 'ar' ? 'مجالك يتحدث عن هذا الموضوع الآن.' : 'Your field is talking about this right now.'}</p></div>
      <div className="next"><span className="eyebrow">WATCH</span><h2>{peerVoice[1] ? `${t('Track')} ${peerVoice[1].name}` : '—'}</h2><p className="muted">{lang === 'ar' ? `${all.length} منشور في الفترة.` : `${all.length} posts in this period.`}</p></div>
    </div>
    {add && <AddPost onClose={() => setAdd(false)} />}
  </>)
}
function voice(posts: Post[], peers: { id: string; name: string }[], me: string, r: Range) {
  const ps = inRange(posts, r)
  const rows = [{ name: me, n: ps.filter((p) => p.lens === 'name').length }, ...peers.map((p) => ({ name: p.name, n: ps.filter((x) => x.peerId === p.id).length }))]
  const total = rows.reduce((a, x) => a + x.n, 0) || 1
  return rows.map((x) => ({ name: x.name, pct: Math.round((x.n / total) * 100) })).sort((a, b) => b.pct - a.pct)
}

/* ---------- Name Lens ---------- */
export function NameLens() {
  const { t, profile, posts, lang, canWrite } = useApp()
  const [r, setR] = useRange(); const [src, setSrc] = useState<Source | 'all'>('all'); const [sent, setSent] = useState<string>('all'); const [add, setAdd] = useState(false)
  const base = inRange(posts.filter((p) => p.lens === 'name'), r)
  const list = base.filter((p) => (src === 'all' || p.source === src) && (sent === 'all' || p.sentiment === sent))
  const st = sentimentStats(base)
  const srcShare = SOURCES.map((s) => ({ s, pct: Math.round((base.filter((p) => p.source === s).length / (base.length || 1)) * 100) })).filter((x) => x.pct > 0).sort((a, b) => b.pct - a.pct)
  return (<>
    <Head eyebrow={`${lang === 'ar' ? 'ما يُقال عن' : 'WHAT IS SAID ABOUT'} ${profile?.orgName}`} title={t('Name Lens')}><RangePills r={r} set={setR} /><button className="btn ghost" onClick={() => exportCsv(list)}>{t('Export')}</button><CollectButton />{canWrite && <button className="btn" onClick={() => setAdd(true)}>{t('Add a post')}</button>}</Head>
    <div className="head" style={{ marginBottom: 16 }}><div className="row"><button className={'pill' + (src === 'all' ? ' on' : '')} onClick={() => setSrc('all')}>{t('All sources')}</button>{SOURCES.map((s) => <button key={s} className={'pill' + (src === s ? ' on' : '')} onClick={() => setSrc(s)}>{s}</button>)}</div>
      <div className="row">{['positive', 'neutral', 'negative'].map((s) => <button key={s} className={'pill' + (sent === s ? ' on' : '')} onClick={() => setSent(sent === s ? 'all' : s)}>{t(s[0].toUpperCase() + s.slice(1))}</button>)}</div></div>
    <div className="card stats" style={{ marginBottom: 18 }}><div className="grid g4"><div><div className="eyebrow">{t('Mentions')}</div><span className="big">{st.total}</span></div><div><div className="eyebrow">{t('Reach')}</div><span className="big">{fmt(st.reach)}</span></div><div><div className="eyebrow">{t('Positive')}</div><span className="big">{st.pos}%</span></div><div><div className="eyebrow">{t('Negative')}</div><span className="big">{st.neg}%</span></div></div></div>
    <div className="grid g2"><div className="card"><div className="head" style={{ marginBottom: 4 }}><h2>{t('Mentions')}</h2><span className="eyebrow">{t('Newest first')}</span></div>{list.length ? list.slice(0, 40).map((p) => <PostRow key={p.id} p={p} />) : <Empty />}</div>
      <div className="grid" style={{ alignContent: 'start' }}><div className="card"><h2>{t('Sentiment by day')}</h2><SentimentBars posts={base} days={Math.min(r === 1 ? 7 : r, 14)} /></div>
        <div className="card"><h2 style={{ marginBottom: 12 }}>{t('Top sources')}</h2>{srcShare.map((x) => <Meter key={x.s} label={x.s} value={x.pct} />)}</div></div></div>
    <YourPages />
    {add && <AddPost onClose={() => setAdd(false)} lens="name" />}
  </>)
}
function exportCsv(ps: Post[]) {
  const esc = (s: string) => '"' + s.replace(/"/g, '""') + '"'
  const csv = 'date,lens,source,author,sentiment,reach,text\n' + ps.map((p) => [new Date(p.ts).toISOString(), p.lens, p.source, esc(p.author), p.sentiment, p.reach, esc(p.text)].join(',')).join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = 'lens-mentions.csv'; a.click()
}

/* ---------- Field Lens ---------- */
export function FieldLens() {
  const { t, profile, posts, saveProfile, canWrite } = useApp()
  const [r, setR] = useRange(); const [draft, setDraft] = useState(''); const [add, setAdd] = useState(false); const [limit, setLimit] = useState(false)
  const topics = profile?.topics || []
  const fp = inRange(posts.filter((p) => p.lens === 'field'), r)
  const prev = posts.filter((p) => p.lens === 'field' && p.ts < Date.now() - r * DAY && p.ts >= Date.now() - 2 * r * DAY)
  const rows = topics.map((tp) => { const n = fp.filter((p) => matchesAny(p.text, [tp])).length, o = prev.filter((p) => matchesAny(p.text, [tp])).length; return { tp, n, d: o ? Math.round(((n - o) / o) * 100) : n ? 100 : 0 } }).sort((a, b) => b.n - a.n)
  const words = topWords(fp.map((p) => p.text), 8)
  const addTopic = async () => { const v = draft.trim(); if (v && topics.length >= planOf(profile?.plan).topics) { setLimit(true); return } if (v && !topics.includes(v)) await saveProfile({ topics: [...topics, v] }); setDraft('') }

  return (<>
    <Head eyebrow={t('What is moving in the field you choose').toUpperCase()} title={t('Field Lens')}><RangePills r={r} set={setR} /><CollectButton />{canWrite && <button className="btn" onClick={() => setAdd(true)}>{t('Add a post')}</button>}</Head>
    {limit && <div className="banner">{t('Your plan is at its topic limit.')} <Link to="/plans">{t('See plans')}</Link></div>}
    <div className="grid g2"><div className="card"><h2 style={{ marginBottom: 12 }}>{t('Topics you follow')}</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}><input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTopic()} placeholder="#hashtag or keyword" /><button className="btn" onClick={addTopic}>{t('Add')}</button></div>
      {rows.length ? <table><tbody>{rows.map((x) => <tr key={x.tp}><td><b>{x.tp}</b></td><td>{x.n} {t('Mentions')}</td><td style={{ color: x.d >= 0 ? 'var(--ok)' : 'var(--err)' }}>{x.d >= 0 ? '+' : ''}{x.d}%</td><td><button className="chip" style={{ border: 0 }} onClick={() => saveProfile({ topics: topics.filter((z) => z !== x.tp) })}>×</button></td></tr>)}</tbody></table> : <p className="muted">—</p>}</div>
      <div className="card"><h2 style={{ marginBottom: 12 }}>{t('Trending in your field')}</h2>{words.length ? words.map((w) => <div className="row2" key={w.word} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}><span>{w.word}</span><b>{w.count}</b></div>) : <Empty />}</div></div>
    <div style={{ marginTop: 18 }}><GrowthActions /></div>
    <div className="card" style={{ marginTop: 18 }}><h2>{t('Field Lens')}</h2>{fp.slice(0, 20).map((p) => <PostRow key={p.id} p={p} />)}</div>
    {add && <AddPost onClose={() => setAdd(false)} lens="field" />}
  </>)
}

/* ---------- Peer Lens ---------- */
export function PeerLens() {
  const { t, wsId, profile, posts, peers, canWrite } = useApp()
  const [r, setR] = useRange(); const [name, setName] = useState(''); const [links, setLinks] = useState<Partial<Record<Source, string>>>({}); const [add, setAdd] = useState(false); const [limit, setLimit] = useState(false)
  const v = voice(posts, peers, profile?.orgName || t('You'), r)
  const addPeer = async () => { if (!wsId || !name.trim()) return; if (peers.length >= planOf(profile?.plan).peers) { setLimit(true); return }; await backend.add(wsId, 'peers', { name: name.trim(), links }); setName(''); setLinks({}) }
  return (<>
    <Head eyebrow={t('What competitors publish and how it lands').toUpperCase()} title={t('Peer Lens')}><RangePills r={r} set={setR} /><CollectButton />{canWrite && <button className="btn" onClick={() => setAdd(true)} disabled={!peers.length}>{t('Add a post')}</button>}</Head>
    {limit && <div className="banner">{t('Your plan is at its rival limit.')} <Link to="/plans">{t('See plans')}</Link></div>}
    <div className="grid g2"><div className="card"><h2 style={{ marginBottom: 14 }}>{t('Share of voice')}</h2>{v.map((x, i) => <Meter key={x.name} label={x.name === (profile?.orgName || '') ? `${t('You')} · ${x.name}` : x.name} value={x.pct} color={['var(--navy)', 'var(--s2)', 'var(--neu)'][i % 3]} />)}</div>
      <div className="card"><h2 style={{ marginBottom: 12 }}>{t('Add a peer')}</h2><Field label={t('Peer name')}><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        {SOURCES.filter((s) => s !== 'News').map((s) => <Field key={s} label={s}><input placeholder="https://" value={links[s] || ''} onChange={(e) => setLinks({ ...links, [s]: e.target.value })} /></Field>)}<button className="btn coral" onClick={addPeer}>{t('Save peer')}</button></div></div>
    <div style={{ marginTop: 18 }}><PeerSuggestions /></div>
    {peers.map((p) => { const ps = inRange(posts.filter((x) => x.peerId === p.id), r); const st = sentimentStats(ps); return (
      <div className="card" key={p.id} style={{ marginTop: 18 }}><div className="head" style={{ marginBottom: 6 }}><h2>{p.name}</h2><div className="row"><span className="tag">{ps.length} {t('Mentions')}</span><span className="tag positive">{st.pos}%</span><span className="tag negative">{st.neg}%</span><button className="btn ghost small" onClick={() => backend.remove(wsId, 'peers', p.id)}>{t('Delete')}</button></div></div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{Object.entries(p.links).filter(([, u]) => u).map(([k, u]) => <a key={k} href={u} target="_blank" rel="noreferrer" style={{ marginInlineEnd: 12 }}>{k}</a>)}</div>
        {ps.slice(0, 4).map((x) => <PostRow key={x.id} p={x} />)}</div>) })}
    {add && <AddPost onClose={() => setAdd(false)} lens="peer" />}
  </>)
}

/* ---------- Alerts ---------- */
export function evalAlert(a: AlertRule, posts: Post[]): { fired: boolean; detail: string } {
  const last = posts.filter((p) => p.ts >= Date.now() - DAY)
  if (a.type === 'negative_spike') { const n = last.filter((p) => p.lens === 'name' && p.sentiment === 'negative').length; return { fired: n >= a.threshold, detail: `${n} negative in 24h (limit ${a.threshold})` } }
  if (a.type === 'volume') { const n = last.filter((p) => p.lens === 'name').length; return { fired: n >= a.threshold, detail: `${n} mentions in 24h (limit ${a.threshold})` } }
  const n = posts.filter((p) => p.ts >= Date.now() - 7 * DAY && matchesAny(p.text, [a.keyword])).length; return { fired: n >= Math.max(1, a.threshold), detail: `"${a.keyword}" seen ${n}x in 7 days` }
}
export function Alerts() {
  const { t, wsId, posts, alerts, canWrite } = useApp()
  const [f, setF] = useState({ name: '', type: 'negative_spike' as AlertRule['type'], threshold: 5, keyword: '' }); const [open, setOpen] = useState(false)
  const rows = alerts.map((a) => ({ a, ...evalAlert(a, posts) }))
  const save = async () => { if (!wsId || !f.name.trim()) return; await backend.add(wsId, 'alerts', { ...f, active: true }); setOpen(false); setF({ name: '', type: 'negative_spike', threshold: 5, keyword: '' }) }
  return (<>
    <Head eyebrow="" title={t('Alerts')}>{canWrite && <button className="btn coral" onClick={() => setOpen(true)}>{t('New alert rule')}</button>}</Head>
    <div className="grid g2"><div className="card"><h2 style={{ marginBottom: 8 }}>{t('Triggered now')}</h2>{rows.filter((x) => x.a.active && x.fired).map((x) => <div className="post" key={x.a.id}><span className="tag negative">!</span><div><b>{x.a.name}</b><br /><small>{x.detail}</small></div></div>)}{!rows.some((x) => x.a.active && x.fired) && <p className="muted">—</p>}</div>
      <div className="card"><h2 style={{ marginBottom: 8 }}>{t('Your rules')}</h2><table><tbody>{rows.map((x) => <tr key={x.a.id}><td><b>{x.a.name}</b><br /><small className="muted">{t(x.a.type === 'negative_spike' ? 'Negative mentions spike' : x.a.type === 'keyword' ? 'Keyword appears' : 'Mention volume')}</small></td><td><span className={'tag ' + (x.fired ? 'negative' : 'positive')}>{x.fired ? 'ON' : 'OK'}</span></td><td><button className="btn ghost small" onClick={() => backend.update(wsId, 'alerts', x.a.id, { active: !x.a.active })}>{x.a.active ? 'Pause' : 'Resume'}</button> <button className="btn ghost small" onClick={() => backend.remove(wsId, 'alerts', x.a.id)}>{t('Delete')}</button></td></tr>)}</tbody></table></div></div>
    {open && <div className="modal" onClick={() => setOpen(false)}><div className="card" onClick={(e) => e.stopPropagation()}><h2 style={{ marginBottom: 16 }}>{t('New alert rule')}</h2>
      <Field label={t('Rule name')}><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Type"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as AlertRule['type'] })}><option value="negative_spike">{t('Negative mentions spike')}</option><option value="keyword">{t('Keyword appears')}</option><option value="volume">{t('Mention volume')}</option></select></Field>
      {f.type === 'keyword' && <Field label="Keyword"><input value={f.keyword} onChange={(e) => setF({ ...f, keyword: e.target.value })} /></Field>}
      <Field label="Threshold"><input type="number" min={1} value={f.threshold} onChange={(e) => setF({ ...f, threshold: +e.target.value })} /></Field>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn ghost" onClick={() => setOpen(false)}>{t('Cancel')}</button><button className="btn coral" onClick={save}>{t('Save')}</button></div></div></div>}
  </>)
}

/* ---------- Reports ---------- */
async function downloadPdf(root: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' }), PW = pdf.internal.pageSize.getWidth(), PH = pdf.internal.pageSize.getHeight(), M = 28
  let y = M
  const secs = Array.from(root.querySelectorAll<HTMLElement>('.rsec'))
  for (const el of secs) {
    const c = await html2canvas(el, { scale: 2, backgroundColor: '#FFFFFF', useCORS: true, logging: false })
    const w = PW - 2 * M, h = (c.height / c.width) * w
    if (y + h > PH - M && y > M) { pdf.addPage(); y = M }
    if (h > PH - 2 * M) { // taller than a page: slice it
      const per = Math.floor(((PH - 2 * M) / h) * c.height)
      for (let off = 0; off < c.height; off += per) {
        const part = document.createElement('canvas'); part.width = c.width; part.height = Math.min(per, c.height - off)
        part.getContext('2d')!.drawImage(c, 0, off, c.width, part.height, 0, 0, c.width, part.height)
        if (off) { pdf.addPage(); y = M }
        const ph = (part.height / part.width) * w; pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', M, y, w, ph); y += ph
      }
    } else { pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', M, y, w, h); y += h + 6 }
  }
  const n = pdf.getNumberOfPages()
  for (let i = 1; i <= n; i++) { pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(120); pdf.text(`LENS · ${i} / ${n}`, PW / 2, PH - 12, { align: 'center' }) }
  pdf.save(filename)
}

export function Reports() {
  const { t, profile, posts, peers, lang } = useApp()
  const [r, setR] = useRange(); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const name = inRange(posts.filter((p) => p.lens === 'name'), r), st = sentimentStats(name)
  const prevSt = sentimentStats(posts.filter((p) => p.lens === 'name' && p.ts < Date.now() - r * DAY && p.ts >= Date.now() - 2 * r * DAY))
  const words = topWords(inRange(posts.filter((p) => p.lens === 'field'), r).map((p) => p.text), 8)
  const v = voice(posts, peers, profile?.orgName || 'You', r)
  const urgent = name.filter((p) => p.urgent || p.sentiment === 'negative').sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || b.reach - a.reach).slice(0, 6)
  const top = [...name].sort((a, b) => b.reach - a.reach).slice(0, 6)
  const period = `${new Date(Date.now() - r * DAY).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en', { month: 'short', day: 'numeric' })} – ${new Date().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en', { month: 'short', day: 'numeric', year: 'numeric' })}`
  const pdf = async () => {
    if (!can.pdf(profile?.plan)) { setErr(t('PDF reports are in Pro and Business.')); return }
    const el = document.getElementById('report'); if (!el) return
    setBusy(true); setErr('')
    try { await downloadPdf(el, `lens-report-${new Date().toISOString().slice(0, 10)}.pdf`) } catch (e) { console.error(e); setErr(t('Could not build the PDF.')) }
    setBusy(false)
  }
  return (<>
    <Head eyebrow="" title={t('Reports')}><RangePills r={r} set={setR} /><button className="btn ghost noprint" onClick={() => exportCsv(inRange(posts, r))}>{t('Download CSV')}</button><button className="btn ghost noprint" onClick={() => window.print()}>{t('Print or save as PDF')}</button><button className="btn coral noprint" disabled={busy || !posts.length} onClick={pdf}>{busy ? t('Building the PDF…') : t('Download PDF')}</button></Head>
    {err && <div className="err">{err}</div>}
    <div id="report" className="card" style={{ background: '#FFFFFF' }}>
      <div className="rsec" style={{ padding: '4px 4px 14px' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><img src={lang === 'ar' ? logoDark.ar : logoDark.en} alt="LENS" height="40" /><div className="eyebrow" style={{ textAlign: 'end' }}>{profile?.orgName}<br />{period}</div></div>
        <h1 style={{ margin: '20px 0 4px' }}>{t('Overview')}</h1><div className="muted">{t('Key numbers')} · {t(r === 1 ? 'Today' : r === 7 ? '7 days' : '30 days')}</div></div>
      <div className="rsec" style={{ padding: 4 }}><div className="grid g4 stats">{[{ k: 'Mentions', v: String(st.total), d: <Delta cur={st.total} prev={prevSt.total} /> }, { k: 'Reach', v: fmt(st.reach), d: <Delta cur={st.reach} prev={prevSt.reach} /> }, { k: 'Positive', v: st.pos + '%', d: <Delta cur={st.pos} prev={prevSt.pos} /> }, { k: 'Negative', v: st.neg + '%', d: <Delta cur={st.neg} prev={prevSt.neg} goodWhenUp={false} /> }].map((c) => <div key={c.k}><div className="eyebrow">{t(c.k)}</div><span className="big">{c.v}</span><br />{c.d}</div>)}</div></div>
      <div className="rsec" style={{ padding: '18px 4px' }}><h2 style={{ marginBottom: 10 }}>{t('Trend')}</h2><TrendChart posts={name} days={r === 1 ? 7 : Math.min(r, 30)} /></div>
      <div className="rsec" style={{ padding: '18px 4px' }}><div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 28 }}><div><h2 style={{ marginBottom: 12 }}>{t('Sentiment mix')}</h2><Donut posts={name} /></div><div><h2 style={{ marginBottom: 12 }}>{t('Share of voice')}</h2>{v.map((x, i) => <Meter key={x.name} label={x.name} value={x.pct} color={['var(--navy)', 'var(--s2)', 'var(--neu)'][i % 3]} />)}</div></div></div>
      <div className="rsec" style={{ padding: '18px 4px' }}><h2 style={{ marginBottom: 10 }}>{t('Trending in your field')}</h2>{words.length ? words.map((w) => <span className="chip" key={w.word} style={{ padding: '5px 12px' }}>{w.word} · {w.count}</span>) : <p className="muted">—</p>}</div>
      <div className="rsec" style={{ padding: '18px 4px' }}><h2 style={{ marginBottom: 4 }}>{t('Needs a reply')}</h2>{urgent.length ? urgent.map((p) => <PostRow key={p.id} p={p} />) : <p className="muted">{t('Nothing urgent.')}</p>}</div>
      <div className="rsec" style={{ padding: '18px 4px' }}><h2 style={{ marginBottom: 4 }}>{t('Top mentions')}</h2>{top.length ? top.map((p) => <PostRow key={p.id} p={p} />) : <p className="muted">—</p>}<div className="muted" style={{ fontSize: 11, marginTop: 14 }}>{t('Generated by LENS')} · {new Date().toLocaleString(lang === 'ar' ? 'ar-EG' : 'en')}</div></div>
    </div>
  </>)
}

/* ---------- Ask LENS ---------- */
export function Ask() {
  const { t, profile, posts, peers, lang, wsId, ai } = useApp()
  const [q, setQ] = useState(''); const [a, setA] = useState(''); const [busy, setBusy] = useState(false); const [via, setVia] = useState('')
  const ask = async (qq: string) => {
    if (!qq.trim()) return
    setBusy(true); setA(''); setVia('')
    try { const r = await backend.call<{ answer: string }>('ask', { wsId, question: qq, lang }); setA(r.answer); setVia('AI') }
    catch {
      try { if (ai.provider === 'none') throw new Error('off'); setA(await askLocalAI(ai, profile, posts, peers, qq, lang)); setVia('AI') }
      catch { setA(answer(qq)); setVia(ai.provider === 'none' ? 'rules' : 'rules-fallback') }
    }
    setBusy(false)
  }
  const answer = (qq: string) => {
    const s = qq.toLowerCase(), ar = /[؀-ۿ]/.test(qq) || lang === 'ar'
    const week = inRange(posts, 7), name = week.filter((p) => p.lens === 'name'), st = sentimentStats(name)
    if (!posts.length) return ar ? 'لا توجد بيانات بعد. أضف منشورات أو حمّل بيانات تجريبية من الإعدادات.' : 'There is no data yet. Add posts or load demo data from Settings.'
    if (/negativ|complain|bad|سلب|شكو|مشكل/.test(s)) { const n = name.filter((p) => p.sentiment === 'negative').sort((x, y) => y.reach - x.reach).slice(0, 3); return (ar ? `السلبي ${st.neg}% هذا الأسبوع. أعلى الإشارات:\n` : `Negative is ${st.neg}% this week. Top mentions:\n`) + n.map((p) => `• ${p.author} (${p.source}, ${fmt(p.reach)}): ${p.text}`).join('\n') }
    if (/peer|compet|rival|share|منافس|حصة/.test(s)) return (ar ? 'حصة الصوت:\n' : 'Share of voice:\n') + voice(posts, peers, profile?.orgName || 'You', 7).map((x) => `• ${x.name}: ${x.pct}%`).join('\n')
    if (/trend|topic|field|ترند|موضوع|مجال/.test(s)) return (ar ? 'الأكثر تداولاً في مجالك:\n' : 'Most talked about in your field:\n') + topWords(inRange(posts.filter((p) => p.lens === 'field'), 7).map((p) => p.text), 5).map((w) => `• ${w.word} (${w.count})`).join('\n')
    if (/source|platform|مصدر|منصة/.test(s)) return (ar ? 'المصادر:\n' : 'Sources:\n') + SOURCES.map((x) => `• ${x}: ${name.filter((p) => p.source === x).length}`).join('\n')
    return ar ? `هذا الأسبوع: ${st.total} إشارة، وصول ${fmt(st.reach)}، إيجابي ${st.pos}%، سلبي ${st.neg}%.` : `This week: ${st.total} mentions, reach ${fmt(st.reach)}, ${st.pos}% positive, ${st.neg}% negative.`
  }
  const examples = lang === 'ar' ? ['ما الشكاوى هذا الأسبوع؟', 'ما حصة الصوت مقابل المنافسين؟', 'ما الرائج في مجالي؟'] : ['What are the complaints this week?', 'What is my share of voice against peers?', 'What is trending in my field?']
  return (<>
    <Head eyebrow="" title={t('Ask LENS')} />
    <div className="card"><h2 style={{ marginBottom: 12 }}>{t('Ask anything about your data')}</h2>
      <div style={{ display: 'flex', gap: 8 }}><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask(q)} /><button className="btn coral" disabled={busy} onClick={() => ask(q)}>{busy ? '…' : t('Ask')}</button></div>
      <div style={{ marginTop: 12 }}>{examples.map((e) => <button className="pill" key={e} style={{ marginInlineEnd: 8, marginBottom: 8 }} onClick={() => { setQ(e); ask(e) }}>{e}</button>)}</div>
      {a && <div className="answer" dir="auto">{a}</div>}
      {via === 'rules' && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{t('Answered with built-in rules. Turn on a free AI provider in Settings > AI for full answers.')}</p>}
      {via === 'rules-fallback' && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{t('The AI provider did not answer, so built-in rules were used. Check Settings > AI.')}</p>}</div>
  </>)
}

/* ---------- Settings ---------- */
export function SeedButtons() {
  const { t, wsId, profile, peers, posts } = useApp()
  const [busy, setBusy] = useState(false)
  return <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 10 }}>
    <button className="btn coral" disabled={busy || !profile} onClick={async () => { if (!wsId || !profile) return; setBusy(true); await backend.addMany(wsId, 'posts', demoPosts(profile, peers)); setBusy(false) }}>{t('Load demo data')}</button>
    {posts.length > 0 && <button className="btn ghost" onClick={async () => { if (!wsId || !confirm('?')) return; for (const p of posts) await backend.remove(wsId, 'posts', p.id) }}>{t('Clear all posts')}</button>}</div>
}
