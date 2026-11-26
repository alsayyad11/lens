import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { backend } from './backend'
import { firebaseConfigured } from './firebase'
import { useApp } from './store'
import { SignIn, SignUp, Reset, Verify } from './Auth'
import Setup from './Setup'
import { Alerts, Ask, FieldLens, NameLens, Overview, PeerLens, Reports } from './Pages'
import { MentionHost, SettingsPage } from './Pages2'
import { ICONS, Logo } from './ui'

function Layout() {
  const { t, profile, user } = useApp()
  const items: [string, string, string][] = [['/', 'Overview', 'overview'], ['/name', 'Name Lens', 'name'], ['/field', 'Field Lens', 'field'], ['/peer', 'Peer Lens', 'peer'], ['/alerts', 'Alerts', 'alerts'], ['/reports', 'Reports', 'reports'], ['/ask', 'Ask LENS', 'ask']]
  const ini = (s?: string) => (s || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="shell">
      <aside className="side"><Logo height={32} />
        <div className="ws"><div className="av">{ini(profile?.orgName)[0]}</div><div><b>{profile?.orgName}</b><small style={{ display: 'block', color: '#9FB0C8' }}>{profile?.accountType === 'company' ? 'Company workspace' : 'Personal workspace'}</small></div></div>
        {items.map(([to, label, ic]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => 'nav' + (isActive ? ' active' : '')}>{ICONS[ic]}{t(label)}</NavLink>)}
        <div className="sp" />
        <NavLink to="/settings" className={({ isActive }) => 'nav' + (isActive ? ' active' : '')}>{ICONS.settings}{t('Settings')}</NavLink>
        <div className="me"><div className="av">{ini(profile?.fullName)}</div><div style={{ flex: 1 }}><b>{profile?.fullName}</b><small>{user?.email}</small></div><button className="nav" style={{ width: 'auto', padding: 6 }} onClick={() => backend.signOut()} title={t('Sign out')}>⏻</button></div>
      </aside>
      <main className="main">
        {!firebaseConfigured && <div className="banner noprint">Demo mode: data is stored in this browser only. Add the Firebase keys to .env to use the cloud.</div>}
        <Routes><Route path="/" element={<Overview />} /><Route path="/name" element={<NameLens />} /><Route path="/field" element={<FieldLens />} /><Route path="/peer" element={<PeerLens />} /><Route path="/alerts" element={<Alerts />} /><Route path="/reports" element={<Reports />} /><Route path="/ask" element={<Ask />} /><Route path="/settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to="/" />} /></Routes>
      </main>
      <MentionHost />
    </div>
  )
}

export default function App() {
  const { user, ready, profile } = useApp()
  if (!ready) return <div className="boot"><Logo mark light={false} height={56} /></div>
  if (!user) return <Routes><Route path="/signup" element={<SignUp />} /><Route path="/reset" element={<Reset />} /><Route path="*" element={<SignIn />} /></Routes>
  if (backend.mode === 'firebase' && !user.emailVerified) return <Verify />
  if (!profile) return <div className="boot"><Logo mark light={false} height={56} /></div>
  if (!profile.setupDone) return <Routes><Route path="/setup" element={<Setup />} /><Route path="*" element={<Navigate to="/setup" />} /></Routes>
  return <Layout />
}
