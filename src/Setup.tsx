import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backend } from './backend'
import { useApp } from './store'
import { Field, GridPattern, Logo } from './ui'
import { SOURCES, type Source } from './types'

const Chips = ({ items, onRemove }: { items: string[]; onRemove: (s: string) => void }) => (
  <div>{items.map((i) => <span className="chip" key={i}>{i}<button onClick={() => onRemove(i)}>×</button></span>)}</div>
)

export default function Setup() {
  const { t, wsId, profile, saveProfile, peers } = useApp()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [handles, setHandles] = useState<string[]>(profile?.handles?.length ? profile.handles : [profile?.orgName || ''].filter(Boolean))
  const [topics, setTopics] = useState<string[]>(profile?.topics || [])
  const [draft, setDraft] = useState('')
  const [peerName, setPeerName] = useState('')
  const [links, setLinks] = useState<Partial<Record<Source, string>>>({})
  const indiv = profile?.accountType === 'individual'
  const add = (list: string[], set: (l: string[]) => void) => { const v = draft.trim(); if (v && !list.includes(v)) set([...list, v]); setDraft('') }
  const addPeer = async () => { if (!wsId || !peerName.trim()) return; await backend.add(wsId, 'peers', { name: peerName.trim(), links }); setPeerName(''); setLinks({}) }
  const finish = async () => { await saveProfile({ handles, topics, setupDone: true }); nav('/') }
  const next = async () => { if (step === 0) await saveProfile({ handles }); if (step === 1) await saveProfile({ topics }); setStep(step + 1); setDraft('') }
  const titles = [t('Set up Name Lens'), t('Set up Field Lens'), t('Set up Peer Lens')]
  return (
    <div className="auth"><div className="auth-art"><GridPattern seed={5} /><Logo height={40} /><div><h1 style={{ fontSize: 40 }}>{titles[step]}</h1></div><ul><li><b>1 / 3</b>{t('Name Lens')}</li><li><b>2 / 3</b>{t('Field Lens')}</li><li><b>3 / 3</b>{t('Peer Lens')}</li></ul></div>
      <div className="auth-main">
        <div className="progress"><i style={{ width: 50 + (step + 1) * 16 + '%' }} /></div>
        {step === 0 && (<><h1>{titles[0]}</h1><p className="muted" style={{ margin: '8px 0 20px' }}>{t('Names and handles Scoop360 listens for')}</p>
          <Field label={indiv ? t('Your public name') : t('Company name')}><div style={{ display: 'flex', gap: 8 }}><input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add(handles, setHandles)} placeholder="@handle, brand, product" /><button className="btn" onClick={() => add(handles, setHandles)}>{t('Add')}</button></div></Field>
          <Chips items={handles} onRemove={(s) => setHandles(handles.filter((h) => h !== s))} /></>)}
        {step === 1 && (<><h1>{titles[1]}</h1><p className="muted" style={{ margin: '8px 0 20px' }}>{t('Topics, keywords and hashtags you follow')}</p>
          <Field label={t('Topics you follow')}><div style={{ display: 'flex', gap: 8 }}><input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add(topics, setTopics)} placeholder="#specialtycoffee" /><button className="btn" onClick={() => add(topics, setTopics)}>{t('Add')}</button></div></Field>
          <Chips items={topics} onRemove={(s) => setTopics(topics.filter((h) => h !== s))} /></>)}
        {step === 2 && (<><h1>{titles[2]}</h1><p className="muted" style={{ margin: '8px 0 20px' }}>{t('Add a peer')}</p>
          <Field label={t('Peer name')}><input value={peerName} onChange={(e) => setPeerName(e.target.value)} /></Field>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>{SOURCES.filter((s) => s !== 'News').map((s) => <Field key={s} label={s}><input placeholder="https://" value={links[s] || ''} onChange={(e) => setLinks({ ...links, [s]: e.target.value })} /></Field>)}</div>
          <button className="btn ghost small" onClick={addPeer}>{t('Save peer')}</button>
          <div style={{ marginTop: 14 }}><Chips items={peers.map((p) => p.name)} onRemove={() => {}} /></div></>)}
        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          {step > 0 && <button className="btn ghost" onClick={() => setStep(step - 1)}>{t('Back')}</button>}
          {step < 2 ? <button className="btn coral" onClick={next}>{t('Continue')} →</button> : <button className="btn coral" onClick={finish}>{t('Finish setup')} →</button>}
          {step < 2 && <button className="btn ghost" onClick={finish}>{t('Skip for now')}</button>}
        </div>
      </div></div>
  )
}
