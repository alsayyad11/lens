// One data layer. Firebase Auth + Firestore + Cloud Functions when configured,
// otherwise a browser-only demo store so the app still runs without keys.
import { app, firebaseConfigured } from './firebase'
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut as fbSignOut, sendPasswordResetEmail, sendEmailVerification, type User,
} from 'firebase/auth'
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc as fbDelete, collection, onSnapshot, addDoc, updateDoc, writeBatch,
} from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import type { Role } from './types'

export interface AuthUser { uid: string; email: string; emailVerified: boolean }
export interface Membership { ownerUid: string; role: Role; name: string }
export type CollName = 'posts' | 'peers' | 'alerts' | 'members' | 'pages'
type Unsub = () => void
const lc = (s: string) => s.trim().toLowerCase()
const toUser = (u: User | null): AuthUser | null => (u ? { uid: u.uid, email: u.email || '', emailVerified: u.emailVerified } : null)

// ---------- Firebase implementation ----------
function firebaseBackend() {
  const auth = getAuth(app!), db = getFirestore(app!), fn = getFunctions(app!)
  return {
    mode: 'firebase' as const,
    onAuth: (cb: (u: AuthUser | null) => void): Unsub => onAuthStateChanged(auth, (u) => cb(toUser(u))),
    signUp: async (email: string, pw: string) => { const c = await createUserWithEmailAndPassword(auth, email, pw); try { await sendEmailVerification(c.user) } catch {} },
    signIn: async (email: string, pw: string) => { await signInWithEmailAndPassword(auth, email, pw) },
    signOut: () => fbSignOut(auth),
    resetPassword: (email: string) => sendPasswordResetEmail(auth, email),
    sendVerification: async () => { if (auth.currentUser) await sendEmailVerification(auth.currentUser) },
    refreshUser: async (): Promise<AuthUser | null> => { if (!auth.currentUser) return null; await auth.currentUser.reload(); await auth.currentUser.getIdToken(true); return toUser(auth.currentUser) },
    getMembership: async (email: string): Promise<Membership | null> => { try { const s = await getDoc(doc(db, 'memberships', lc(email))); return s.exists() ? (s.data() as Membership) : null } catch { return null } },
    getProfile: async (ws: string) => { const s = await getDoc(doc(db, 'users', ws)); return s.exists() ? s.data() : null },
    setProfile: (ws: string, data: object) => setDoc(doc(db, 'users', ws), data, { merge: true }),
    getPrivate: async (ws: string, name: string) => { const s = await getDoc(doc(db, 'users', ws, 'private', name)); return s.exists() ? s.data() : null },
    setPrivate: (ws: string, name: string, data: object) => setDoc(doc(db, 'users', ws, 'private', name), data, { merge: true }),
    subscribePrivate: (ws: string, name: string, cb: (d: any) => void): Unsub => onSnapshot(doc(db, 'users', ws, 'private', name), (s) => cb(s.exists() ? s.data() : null), () => cb(null)),
    subscribe: (ws: string, name: CollName, cb: (rows: any[]) => void): Unsub =>
      onSnapshot(collection(db, 'users', ws, name), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([])),
    add: async (ws: string, name: CollName, data: object) => { await addDoc(collection(db, 'users', ws, name), data) },
    addMany: async (ws: string, name: CollName, rows: object[]) => {
      for (let i = 0; i < rows.length; i += 400) { const b = writeBatch(db); rows.slice(i, i + 400).forEach((r) => b.set(doc(collection(db, 'users', ws, name)), r)); await b.commit() }
    },
    update: (ws: string, name: CollName, id: string, data: object) => updateDoc(doc(db, 'users', ws, name, id), data),
    remove: (ws: string, name: CollName, id: string) => fbDelete(doc(db, 'users', ws, name, id)),
    setMembership: (email: string, m: Membership) => setDoc(doc(db, 'memberships', lc(email)), m),
    removeMembership: (email: string) => fbDelete(doc(db, 'memberships', lc(email))),
    call: async <T = any>(name: string, data: object): Promise<T> => (await httpsCallable(fn, name, { timeout: 300000 })(data)).data as T,
  }
}

// ---------- Local demo implementation (localStorage) ----------
function localBackend() {
  const KEY = 'lens-demo-v2'
  type Store = { users: Record<string, { email: string; pw: string }>; data: Record<string, any>; memberships: Record<string, Membership>; session: string | null }
  const load = (): Store => { try { const s = JSON.parse(localStorage.getItem(KEY) || ''); s.memberships = s.memberships || {}; return s } catch { return { users: {}, data: {}, memberships: {}, session: null } } }
  const save = (s: Store) => localStorage.setItem(KEY, JSON.stringify(s))
  const listeners = new Set<() => void>(); const emit = () => listeners.forEach((f) => f())
  const uidFor = (email: string) => 'u_' + lc(email).replace(/[^a-z0-9]/g, '_')
  const rows = (s: Store, ws: string, name: string): any[] => (s.data[ws]?.[name] ? Object.entries<any>(s.data[ws][name]).map(([id, v]) => ({ id, ...v })) : [])
  const err = (code: string) => Object.assign(new Error(code), { code })
  const key = () => 'd' + Date.now() + Math.random().toString(36).slice(2, 9)
  const ensure = (s: Store, ws: string, name?: string) => { s.data[ws] = s.data[ws] || {}; if (name) s.data[ws][name] = s.data[ws][name] || {} }
  return {
    mode: 'local' as const,
    onAuth: (cb: (u: AuthUser | null) => void): Unsub => {
      const f = () => { const s = load(); cb(s.session ? { uid: s.session, email: s.users[s.session]?.email || '', emailVerified: true } : null) }
      listeners.add(f); f(); return () => listeners.delete(f)
    },
    signUp: async (email: string, pw: string) => {
      const s = load(); const uid = uidFor(email)
      if (s.users[uid]) throw err('auth/email-already-in-use'); if (pw.length < 6) throw err('auth/weak-password')
      s.users[uid] = { email, pw }; s.session = uid; save(s); emit()
    },
    signIn: async (email: string, pw: string) => { const s = load(); const uid = uidFor(email); if (!s.users[uid] || s.users[uid].pw !== pw) throw err('auth/invalid-credential'); s.session = uid; save(s); emit() },
    signOut: async () => { const s = load(); s.session = null; save(s); emit() },
    resetPassword: async (_e: string) => {},
    sendVerification: async () => {},
    refreshUser: async (): Promise<AuthUser | null> => { const s = load(); return s.session ? { uid: s.session, email: s.users[s.session].email, emailVerified: true } : null },
    getMembership: async (email: string) => load().memberships[lc(email)] || null,
    getProfile: async (ws: string) => load().data[ws]?.profile || null,
    setProfile: async (ws: string, data: object) => { const s = load(); ensure(s, ws); s.data[ws].profile = { ...(s.data[ws].profile || {}), ...data }; save(s); emit() },
    getPrivate: async (ws: string, name: string) => load().data[ws]?.['private_' + name] || null,
    setPrivate: async (ws: string, name: string, data: object) => { const s = load(); ensure(s, ws); s.data[ws]['private_' + name] = { ...(s.data[ws]['private_' + name] || {}), ...data }; save(s); emit() },
    subscribePrivate: (ws: string, name: string, cb: (d: any) => void): Unsub => { const f = () => cb(load().data[ws]?.['private_' + name] || null); listeners.add(f); f(); return () => listeners.delete(f) },
    subscribe: (ws: string, name: CollName, cb: (r: any[]) => void): Unsub => { const f = () => cb(rows(load(), ws, name)); listeners.add(f); f(); return () => listeners.delete(f) },
    add: async (ws: string, name: CollName, data: object) => { const s = load(); ensure(s, ws, name); s.data[ws][name][key()] = data; save(s); emit() },
    addMany: async (ws: string, name: CollName, list: object[]) => { const s = load(); ensure(s, ws, name); list.forEach((r) => { s.data[ws][name][key()] = r }); save(s); emit() },
    update: async (ws: string, name: CollName, id: string, data: object) => { const s = load(); s.data[ws][name][id] = { ...s.data[ws][name][id], ...data }; save(s); emit() },
    remove: async (ws: string, name: CollName, id: string) => { const s = load(); delete s.data[ws][name][id]; save(s); emit() },
    setMembership: async (email: string, m: Membership) => { const s = load(); s.memberships[lc(email)] = m; save(s); emit() },
    removeMembership: async (email: string) => { const s = load(); delete s.memberships[lc(email)]; save(s); emit() },
    call: async <T = any>(_name: string, _data: object): Promise<T> => { throw err('local-mode') },
  }
}

export const backend = firebaseConfigured ? firebaseBackend() : localBackend()
