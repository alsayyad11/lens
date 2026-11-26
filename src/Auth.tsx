import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { backend } from './backend'
import { useApp } from './store'
import { Field, GridPattern, Logo, TwoWeight } from './ui'
import type { AccountType } from './types'

const msg = (e: any, t: (s: string) => string) => e?.code === 'auth/email-already-in-use' ? t('This email already has an account.') : e?.code === 'auth/weak-password' ? t('Password must be at least 6 characters.') : e?.code === 'auth/invalid-email' ? 'Invalid email.' : t('Wrong email or password. Try again.')

function Art() {
  const { t } = useApp()
  return (
    <div className="auth-art"><GridPattern seed={11} n={34} /><Logo height={40} />
      <div style={{ position: 'relative' }}><h1><TwoWeight text={t('Know first.')} /><br /><TwoWeight text={t('See everything.')} /></h1><p>{t('Arabic-first social listening that reads the whole conversation, then tells you what matters.')}</p></div>
      <ul><li><b>NAME LENS</b>{t('What is said about you, everywhere')}</li><li><b>FIELD LENS</b>{t('What is moving in the field you choose')}</li><li><b>PEER LENS</b>{t('What competitors publish and how it lands')}</li></ul>
    </div>
  )
}
const Shell = ({ children, progress }: { children: React.ReactNode; progress?: number }) => (
  <div className="auth"><Art /><div className="auth-main">{progress !== undefined && <div className="progress"><i style={{ width: progress + '%' }} /></div>}{children}</div></div>
)

export function SignUp() {
  const { t, lang, setLang, saveProfile } = useApp()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [type, setType] = useState<AccountType>('company')
  const [f, setF] = useState({ fullName: '', orgName: '', role: '', email: '', pw: '' })
  const [err, setErr] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }))

  const submit = async () => {
    const e: Record<string, string> = {}
    if (!f.fullName.trim()) e.fullName = t('Full name') + ' ?'
    if (!f.orgName.trim()) e.orgName = (type === 'company' ? t('Company name') : t('Your public name')) + ' ?'
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Invalid email.'
    if (f.pw.length < 6) e.pw = t('Password must be at least 6 characters.')
    setErr(e); if (Object.keys(e).length) return
    setBusy(true)
    try {
      // saved before sign-up so the signed-in listener can write it as soon as auth lands
      localStorage.setItem('lens-pending-profile', JSON.stringify({ accountType: type, fullName: f.fullName, orgName: f.orgName, role: f.role, handles: [f.orgName], topics: [], setupDone: false, lang }))
      await backend.signUp(f.email.trim(), f.pw)
      nav('/setup')
    } catch (x) { localStorage.removeItem('lens-pending-profile'); setErr({ form: msg(x, t) }) } finally { setBusy(false) }
  }
  void saveProfile
  return (
    <Shell progress={step === 0 ? 25 : 50}>
      <div className="topline"><span>{t('Already with us?')}&nbsp;<Link to="/signin">{t('Sign in')}</Link></span>&nbsp;&nbsp;<button className="pill" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>{lang === 'en' ? 'العربية' : 'English'}</button></div>
      {step === 0 ? (<>
        <h1>{t('Who is LENS watching for?')}</h1><p className="muted" style={{ marginTop: 8 }}>{t('This choice is permanent. The account type cannot be changed after sign-up.')}</p>
        <div className="types">
          <button className={'type' + (type === 'company' ? ' on' : '')} onClick={() => setType('company')}><span className="eyebrow" style={{ color: 'var(--coral)' }}>B2B · {lang === 'ar' ? 'شركة' : 'COMPANY'}</span><h2>{t('A company')}</h2><p>{t('Brands, agencies and teams that protect a reputation and outpace a market.')}</p></button>
          <button className={'type' + (type === 'individual' ? ' on' : '')} onClick={() => setType('individual')}><span className="eyebrow" style={{ color: 'var(--coral)' }}>B2C · {lang === 'ar' ? 'فرد' : 'INDIVIDUAL'}</span><h2>{t('Just me')}</h2><p>{t('Creators, executives, public figures and freelancers who are their own brand.')}</p></button>
        </div>
        <div><button className="btn coral" onClick={() => setStep(1)}>{t('Continue')} →</button></div>
      </>) : (<>
        <h1>{t('Your details')}</h1><div style={{ height: 20 }} />
        <Field label={t('Full name')} error={err.fullName}><input value={f.fullName} onChange={(e) => set('fullName', e.target.value)} /></Field>
        <Field label={type === 'company' ? t('Company name') : t('Your public name')} error={err.orgName}><input value={f.orgName} onChange={(e) => set('orgName', e.target.value)} /></Field>
        {type === 'company' && <Field label={t('Your role')}><input value={f.role} onChange={(e) => set('role', e.target.value)} /></Field>}
        <Field label={t('Email')} error={err.email}><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label={t('Password')} error={err.pw}><input type="password" value={f.pw} onChange={(e) => set('pw', e.target.value)} /></Field>
        {err.form && <div className="err">{err.form}</div>}
        <div style={{ display: 'flex', gap: 10 }}><button className="btn ghost" onClick={() => setStep(0)}>{t('Back')}</button><button className="btn coral" disabled={busy} onClick={submit}>{t('Create account')} →</button></div>
      </>)}
    </Shell>
  )
}

export function SignIn() {
  const { t, lang, setLang } = useApp()
  const nav = useNavigate()
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const go = async () => { setBusy(true); setErr(''); try { await backend.signIn(email.trim(), pw); nav('/') } catch { setErr(t('Wrong email or password. Try again.')) } finally { setBusy(false) } }
  return (
    <Shell>
      <div className="topline"><span><Link to="/signup">{t('Create account')}</Link></span>&nbsp;&nbsp;<button className="pill" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>{lang === 'en' ? 'العربية' : 'English'}</button></div>
      <h1>{t('Sign in')}</h1><div style={{ height: 20 }} />
      <Field label={t('Email')}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label={t('Password')}><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} /></Field>
      {err && <div className="err">{err}</div>}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><button className="btn coral" disabled={busy} onClick={go}>{t('Sign in')} →</button><Link to="/reset">{t('Forgot password?')}</Link></div>
    </Shell>
  )
}

export function Reset() {
  const { t } = useApp()
  const [email, setEmail] = useState(''), [sent, setSent] = useState(false)
  return (
    <Shell>
      <h1>{t('Reset password')}</h1><div style={{ height: 20 }} />
      <Field label={t('Email')}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      {sent && <p className="ok" style={{ marginBottom: 12 }}>{t('We sent a reset link if this email has an account.')}</p>}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><button className="btn coral" onClick={async () => { try { await backend.resetPassword(email.trim()) } catch {} setSent(true) }}>{t('Send reset link')}</button><Link to="/signin">{t('Back to sign in')}</Link></div>
    </Shell>
  )
}

export function Verify() {
  const { t, user, setUser } = useApp()
  const [msg, setMsg] = useState('')
  return (
    <Shell progress={75}>
      <h1>{t('Verify your email')}</h1>
      <p className="muted" style={{ margin: '10px 0 22px', maxWidth: 460 }}>{t('We sent a verification link to')} <b>{user?.email}</b>. {t('Open it, then come back and continue.')}</p>
      {msg && <p className="ok" style={{ marginBottom: 12 }}>{msg}</p>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn coral" onClick={async () => { const u = await backend.refreshUser(); if (u?.emailVerified) setUser(u); else setMsg(t('Not verified yet. Check your inbox and spam folder.')) }}>{t('I verified, continue')} →</button>
        <button className="btn ghost" onClick={async () => { await backend.sendVerification(); setMsg(t('Verification email sent again.')) }}>{t('Resend email')}</button>
        <button className="btn ghost" onClick={() => backend.signOut()}>{t('Sign out')}</button>
      </div>
    </Shell>
  )
}
