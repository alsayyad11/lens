import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { backend, type AuthUser } from './backend'
import { AR } from './i18n'
import { EMPTY_AI, EMPTY_SOURCES, type AiSettings, type AlertRule, type Member, type OwnPage, type Peer, type Post, type Profile, type Role, type SourcesConfig } from './types'

interface Ctx {
  user: AuthUser | null; ready: boolean; profile: Profile | null; posts: Post[]; peers: Peer[]; alerts: AlertRule[]; members: Member[]; pages: OwnPage[]
  sources: SourcesConfig; ai: AiSettings; wsId: string; role: Role; canWrite: boolean; canAdmin: boolean; myName: string
  lang: 'en' | 'ar'; setLang: (l: 'en' | 'ar') => void; t: (s: string) => string
  saveProfile: (p: Partial<Profile>) => Promise<void>; setUser: (u: AuthUser | null) => void
}
const C = createContext<Ctx>(null as any)
export const useApp = () => useContext(C)

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [ready, setReady] = useState(false)
  const [wsId, setWsId] = useState(''), [role, setRole] = useState<Role>('owner'), [myName, setMyName] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<Post[]>([]), [peers, setPeers] = useState<Peer[]>([]), [alerts, setAlerts] = useState<AlertRule[]>([])
  const [members, setMembers] = useState<Member[]>([]), [pages, setPages] = useState<OwnPage[]>([])
  const [sources, setSources] = useState<SourcesConfig>(EMPTY_SOURCES), [ai, setAi] = useState<AiSettings>(EMPTY_AI)
  const [lang, setLangState] = useState<'en' | 'ar'>((localStorage.getItem('lens-lang') as any) || 'en')

  const setLang = (l: 'en' | 'ar') => { setLangState(l); localStorage.setItem('lens-lang', l) }
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr' }, [lang])

  useEffect(() => backend.onAuth((u) => {
    setUser((old) => (old && u && old.uid === u.uid && old.emailVerified === u.emailVerified ? old : u))
    if (!u) { setWsId(''); setProfile(null); setPosts([]); setPeers([]); setAlerts([]); setMembers([]); setPages([]); setReady(true) }
  }), [])

  useEffect(() => {
    if (!user) return
    let alive = true; const subs: (() => void)[] = []
    ;(async () => {
      const ms = await backend.getMembership(user.email)
      const ws = ms ? ms.ownerUid : user.uid, r: Role = ms ? ms.role : 'owner'
      let p = (await backend.getProfile(ws).catch(() => null)) as Profile | null
      if (!p && !ms) { const raw = localStorage.getItem('lens-pending-profile'); if (raw) { p = JSON.parse(raw) as Profile; await backend.setProfile(ws, p); localStorage.removeItem('lens-pending-profile') } }
      if (!alive) return
      setWsId(ws); setRole(r); setMyName(ms?.name || p?.fullName || ''); setProfile(p); setReady(true)
      subs.push(backend.subscribe(ws, 'posts', (x) => setPosts((x as Post[]).sort((a, b) => b.ts - a.ts))))
      subs.push(backend.subscribe(ws, 'peers', (x) => setPeers(x as Peer[])))
      subs.push(backend.subscribe(ws, 'alerts', (x) => setAlerts(x as AlertRule[])))
      subs.push(backend.subscribe(ws, 'members', (x) => setMembers(x as Member[])))
      subs.push(backend.subscribe(ws, 'pages', (x) => setPages(x as OwnPage[])))
      if (r === 'owner' || r === 'admin') { subs.push(backend.subscribePrivate(ws, 'sources', (d) => setSources({ ...EMPTY_SOURCES, ...(d || {}) }))); subs.push(backend.subscribePrivate(ws, 'ai', (d) => setAi({ ...EMPTY_AI, ...(d || {}) }))) }
      if (ms) { const mine = ((await new Promise<Member[]>((res) => { const u = backend.subscribe(ws, 'members', (x) => { res(x as Member[]); u() }) })).find((m) => m.email.toLowerCase() === user.email.toLowerCase())); if (mine && mine.status !== 'active') backend.update(ws, 'members', mine.id, { status: 'active' }).catch(() => {}) }
    })()
    return () => { alive = false; subs.forEach((u) => u()) }
  }, [user?.uid, user?.emailVerified])

  const saveProfile = async (p: Partial<Profile>) => { if (!wsId) return; await backend.setProfile(wsId, p); setProfile((old) => ({ ...(old as Profile), ...p })) }
  const t = useMemo(() => (s: string) => (lang === 'ar' ? AR[s] || s : s), [lang])
  const canWrite = role !== 'viewer', canAdmin = role === 'owner' || role === 'admin'
  return <C.Provider value={{ user, ready, profile, posts, peers, alerts, members, pages, sources, ai, wsId, role, canWrite, canAdmin, myName, lang, setLang, t, saveProfile, setUser }}>{children}</C.Provider>
}
