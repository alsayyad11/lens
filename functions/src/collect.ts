import { createHash } from 'crypto'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { classifyBatch } from './ai'
import type { AiCfg } from './llm'
import { norm } from './lexicon'
import * as S from './sources'
import type { Item, Lens } from './sources'

export interface Tagged extends Item { lens: Lens; peerId?: string }
const hasArabic = (s: string) => /[؀-ۿ]/.test(s)
const matches = (text: string, term: string) => norm(text).includes(norm(term.replace(/^#/, '')))
const handleOf = (url?: string) => { try { const u = new URL(url || ''); const h = u.pathname.split('/').filter(Boolean)[0]; return h && !/^(i|home|search|intent)$/.test(h) ? h.replace(/^@/, '') : '' } catch { return '' } }

export interface Plan { name: string[]; field: string[]; peers: { id: string; name: string; x?: string }[] }

/** Where a text belongs: peers first (they are explicit), then own name, then the field. */
export function assignLens(text: string, plan: Plan): { lens: Lens; peerId?: string } | null {
  for (const p of plan.peers) if (matches(text, p.name)) return { lens: 'peer', peerId: p.id }
  if (plan.name.some((n) => matches(text, n))) return { lens: 'name' }
  if (plan.field.some((n) => matches(text, n))) return { lens: 'field' }
  return null
}

export async function gather(f: S.Fetch, cfg: any, plan: Plan, ownName: string, status: Record<string, any>): Promise<Tagged[]> {
  const out: Tagged[] = []
  const run = async (key: string, fn: () => Promise<Tagged[]>) => {
    try { const r = await fn(); out.push(...r); status[key] = { state: 'ok', last: Date.now(), count: r.length } }
    catch (e) { status[key] = { state: 'failed', last: Date.now(), message: (e as Error).message.slice(0, 220), count: 0 } }
  }
  const tag = (items: Item[], lens: Lens, peerId?: string): Tagged[] => items.map((i) => ({ ...i, lens, ...(peerId ? { peerId } : {}) }))
  const groups: { terms: string[]; lens: Lens; peerId?: string }[] = [
    { terms: plan.name, lens: 'name' }, { terms: plan.field, lens: 'field' },
    ...plan.peers.map((p) => ({ terms: [p.name], lens: 'peer' as Lens, peerId: p.id })),
  ]

  if (cfg.news?.enabled !== false) await run('news', async () => {
    const all: Tagged[] = []; let ok = 0, lastErr: Error | null = null
    for (const g of groups) for (const term of g.terms.filter(Boolean).slice(0, 8)) {
      for (const ar of hasArabic(term) ? [true] : [false, true]) {
        try { const items = await S.googleNews(f, term, ar); ok++; all.push(...tag(items.filter((i) => matches(i.text, term)), g.lens, g.peerId)) } catch (e) { lastErr = e as Error }
      }
    }
    if (!ok && lastErr) throw lastErr
    return all
  })

  // Free sources. Each one reports its own status, and one failing never stops the others.
  const on = (k: string, dflt: boolean) => (cfg[k] ? cfg[k].enabled !== false : dflt)
  const perTerm = async (fn: (term: string, g: { lens: Lens; peerId?: string }) => Promise<Item[]>, opts: { maxTerms: number; gapMs?: number; filter?: boolean }) => {
    const all: Tagged[] = []; let ok = 0, tries = 0, lastErr: Error | null = null
    for (const g of groups) for (const term of g.terms.filter(Boolean).slice(0, opts.maxTerms)) {
      if (opts.gapMs && tries++) await S.clock.sleep(opts.gapMs)
      try { const items = await fn(term, g); ok++; all.push(...tag(opts.filter === false ? items : items.filter((i) => matches(i.text, term)), g.lens, g.peerId)) } catch (e) { lastErr = e as Error }
    }
    if (!ok && lastErr) throw lastErr
    return all
  }
  if (on('bing', true)) await run('bing', () => perTerm(async (term) => { const out: Item[] = []; for (const ar of hasArabic(term) ? [true] : [false, true]) out.push(...await S.bingNews(f, term, ar)); return out }, { maxTerms: 6 }))
  if (on('reddit', true)) await run('reddit', () => perTerm((term) => S.reddit(f, term), { maxTerms: 4, gapMs: 1200 }))
  if (on('mastodon', true)) await run('mastodon', () => perTerm((term) => S.mastodon(f, term), { maxTerms: 4, filter: false }))
  if (on('gdelt', false)) await run('gdelt', () => perTerm((term) => S.gdelt(f, term), { maxTerms: 3, gapMs: 5300 }))
  if (on('hackernews', false)) await run('hackernews', () => perTerm((term) => S.hackerNews(f, term), { maxTerms: 4 }))

  if (cfg.blogs?.enabled) await run('blogs', async () => {
    const all: Tagged[] = []; let ok = 0, lastErr: Error | null = null
    for (const url of (cfg.blogs.feeds || []).slice(0, 20)) {
      try { for (const it of await S.rssFeed(f, url)) { const a = assignLens(it.text, plan); if (a) all.push({ ...it, ...a }) } ok++ } catch (e) { lastErr = e as Error }
    }
    if (!ok && lastErr) throw lastErr
    return all
  })

  if (cfg.x?.enabled && cfg.x.bearer) await run('x', async () => {
    const all: Tagged[] = []
    for (const g of groups) for (const term of g.terms.filter(Boolean).slice(0, 5)) all.push(...tag(await S.xSearch(f, cfg.x.bearer, `"${term}"`), g.lens, g.peerId))
    for (const p of plan.peers) if (p.x) all.push(...tag(await S.xSearch(f, cfg.x.bearer, `from:${p.x}`), 'peer', p.id))
    return all
  })

  if (cfg.facebook?.enabled && cfg.facebook.pageId && cfg.facebook.token) await run('facebook', async () => tag(await S.facebookPage(f, cfg.facebook.pageId, cfg.facebook.token, ownName), 'name'))
  if (cfg.instagram?.enabled && cfg.instagram.userId && cfg.instagram.token) await run('instagram', async () => tag(await S.instagramTags(f, cfg.instagram.userId, cfg.instagram.token), 'name'))
  return out
}

export const docId = (it: Item) => createHash('sha1').update(it.source + '|' + it.externalId).digest('hex').slice(0, 24)

export async function collectWorkspace(ws: string, ai: AiCfg | undefined, f: S.Fetch = fetch): Promise<{ added: number; usedAI: boolean }> {
  const db = getFirestore()
  const base = db.collection('users').doc(ws)
  const [prof, peersSnap, srcSnap] = await Promise.all([base.get(), base.collection('peers').get(), base.collection('private').doc('sources').get()])
  const profile: any = prof.data() || {}, cfg: any = srcSnap.data() || { news: { enabled: true } }
  const plan: Plan = {
    name: [...new Set<string>([profile.orgName, ...(profile.handles || [])].filter(Boolean))], field: profile.topics || [],
    peers: peersSnap.docs.map((d) => { const p: any = d.data(); return { id: d.id, name: p.name, x: handleOf(p.links?.X) } }),
  }
  const status: Record<string, any> = {}
  const items = await gather(f, cfg, plan, profile.orgName || '', status)

  // keep only new items
  const seen = new Map<string, Tagged>(); items.forEach((i) => seen.set(docId(i), i))
  const ids = [...seen.keys()]
  const existing = new Set<string>()
  for (let i = 0; i < ids.length; i += 300) { const refs = ids.slice(i, i + 300).map((id) => base.collection('posts').doc(id)); (await db.getAll(...refs)).forEach((s) => s.exists && existing.add(s.id)) }
  const fresh = ids.filter((id) => !existing.has(id)).map((id) => ({ id, it: seen.get(id)! })).slice(0, 150)

  let usedAI = false
  if (fresh.length) {
    const { out, usedAI: used } = await classifyBatch(ai, plan.name[0] || 'the brand', fresh.map((x) => x.it.text), f)
    usedAI = used
    const w = db.bulkWriter()
    fresh.forEach(({ id, it }, i) => {
      const c = out[i]
      const post: any = { lens: it.lens, author: it.author, source: it.source, text: it.text, sentiment: c.sentiment, urgent: c.urgent, topics: c.topics, summary: c.summary, reach: it.reach, reactions: it.reactions, ts: it.ts, externalId: it.externalId }
      if (it.url) post.url = it.url
      if (it.peerId) post.peerId = it.peerId
      w.create(base.collection('posts').doc(id), post).catch(() => {})
    })
    await w.close()
  }
  const merged: Record<string, any> = {}
  for (const [k, v] of Object.entries(status)) merged[k] = v
  await base.collection('private').doc('sources').set({ status: merged, lastRun: FieldValue.serverTimestamp() }, { merge: true })
  return { added: fresh.length, usedAI }
}
