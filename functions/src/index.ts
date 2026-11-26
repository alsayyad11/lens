import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { llm, llmWithFallback, type AiCfg } from './llm'
import { collectWorkspace } from './collect'
import { norm } from './lexicon'

initializeApp()
const DAY = 864e5

/** The AI provider and key the workspace admin saved in Settings > AI. Undefined when none is set. */
async function aiConfig(ws: string): Promise<AiCfg | undefined> {
  const d = (await getFirestore().collection('users').doc(ws).collection('private').doc('ai').get()).data()
  return d && d.provider && d.provider !== 'none' ? { provider: d.provider, key: d.key || undefined, model: d.model || undefined } : undefined
}

type Role = 'owner' | 'admin' | 'analyst' | 'viewer'
/** The caller must be the workspace owner or an invited member with a high enough role. */
async function authorize(req: CallableRequest, need: 'read' | 'write'): Promise<string> {
  const uid = req.auth?.uid, email = (req.auth?.token.email || '').toLowerCase()
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.')
  const db = getFirestore()
  const m = email ? (await db.collection('memberships').doc(email).get()).data() : undefined
  const ws: string = m ? m.ownerUid : uid, role: Role = m ? m.role : 'owner'
  if (need === 'write' && role === 'viewer') throw new HttpsError('permission-denied', 'Viewers cannot do this.')
  return ws
}

export const collectNow = onCall({ timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  const ws = await authorize(req, 'write')
  try { return await collectWorkspace(ws, await aiConfig(ws)) } catch (e) { throw new HttpsError('internal', (e as Error).message) }
})

export const collectScheduled = onSchedule({ schedule: 'every 30 minutes', timeoutSeconds: 540, memory: '512MiB' }, async () => {
  const snap = await getFirestore().collection('users').where('setupDone', '==', true).get()
  for (const d of snap.docs) { try { await collectWorkspace(d.id, await aiConfig(d.id)) } catch (e) { console.error('collect failed for', d.id, (e as Error).message) } }
})

export const draftReply = onCall({ timeoutSeconds: 60 }, async (req) => {
  const ws = await authorize(req, 'write')
  const { text, author, source, sentiment, brand, lang } = req.data || {}
  if (!text) throw new HttpsError('invalid-argument', 'text is required')
  const sys = `You write short public replies for the brand "${brand}" on ${source}. Match the language and dialect of the post (Egyptian Arabic stays Egyptian). Be warm, human, specific, never defensive. If the post is negative, apologize once, own the issue, and move to a private channel. If positive, thank them briefly. Max 45 words. No hashtags, no emojis unless the post uses them. Output only the reply.`
  try { const r = await llmWithFallback(await aiConfig(ws), sys, `Author: ${author}\nSentiment: ${sentiment}\nPost: ${text}\nReply language hint: ${lang}`, 300); return { reply: r.text.trim(), provider: r.provider } }
  catch (e) { throw new HttpsError('unavailable', 'AI unavailable: ' + (e as Error).message) }
})

export const aiTest = onCall({ timeoutSeconds: 60 }, async (req) => {
  const ws = await authorize(req, 'write')
  const cfg = await aiConfig(ws)
  if (!cfg) throw new HttpsError('failed-precondition', 'Save an AI provider and key in Settings first.')
  try { return { reply: (await llm(cfg, 'Reply with the single word OK.', 'ping', 20)).trim(), provider: cfg.provider } }
  catch (e) { throw new HttpsError('unavailable', (e as Error).message) }
})

export const ask = onCall({ timeoutSeconds: 90 }, async (req) => {
  const ws = await authorize(req, 'read')
  const { question, lang } = req.data || {}
  if (!question) throw new HttpsError('invalid-argument', 'question is required')
  const db = getFirestore(), base = db.collection('users').doc(ws)
  const [prof, postsSnap, peersSnap] = await Promise.all([base.get(), base.collection('posts').where('ts', '>=', Date.now() - 14 * DAY).get(), base.collection('peers').get()])
  const profile: any = prof.data() || {}, posts = postsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  const peers = new Map(peersSnap.docs.map((d) => [d.id, (d.data() as any).name]))
  const wk = posts.filter((p) => p.ts >= Date.now() - 7 * DAY), line = (p: any) => `- [${p.lens}${p.peerId ? ':' + peers.get(p.peerId) : ''}|${p.source}|${p.sentiment}${p.urgent ? '|URGENT' : ''}|reach ${p.reach}|${new Date(p.ts).toISOString().slice(0, 10)}] ${p.author}: ${String(p.text).slice(0, 220)}`
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0), name = wk.filter((p) => p.lens === 'name')
  const ctx = [
    `Workspace: ${profile.orgName} (${profile.accountType}). Names tracked: ${(profile.handles || []).join(', ')}. Topics: ${(profile.topics || []).join(', ')}. Peers: ${[...peers.values()].join(', ')}.`,
    `Last 7 days, own mentions: ${name.length}, positive ${pct(name.filter((p) => p.sentiment === 'positive').length, name.length)}%, negative ${pct(name.filter((p) => p.sentiment === 'negative').length, name.length)}%.`,
    `Posts per lens (7d): name ${name.length}, field ${wk.filter((p) => p.lens === 'field').length}, ${[...peers].map(([id, n]) => `${n} ${wk.filter((p) => p.peerId === id).length}`).join(', ')}.`,
    'Most relevant posts:', ...posts.sort((a, b) => (b.urgent ? 1e9 : 0) + b.reach - ((a.urgent ? 1e9 : 0) + a.reach)).slice(0, 25).map(line),
  ].join('\n')
  const sys = `You are Ask Scoop360, the analyst inside a social listening product. Answer ONLY from the data provided. If the data cannot answer, say what is missing. Be concise and concrete: numbers, names, and a recommended next step when useful. Answer in ${lang === 'ar' ? 'Arabic' : 'the language of the question'}.`
  try { const r = await llmWithFallback(await aiConfig(ws), sys, `Data:\n${ctx}\n\nQuestion: ${question}`, 700); return { answer: r.text.trim(), provider: r.provider } }
  catch (e) { throw new HttpsError('unavailable', 'AI unavailable: ' + (e as Error).message) }
})
void norm
