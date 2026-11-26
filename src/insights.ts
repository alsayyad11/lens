import { matchesAny, topWords } from './nlp'
import type { Peer, Post, Profile } from './types'

const DAY = 864e5
export interface Suggestion { name: string; why: string }
export interface Action { title: string; why: string; kind: 'reply' | 'fix' | 'content' | 'amplify' | 'watch' }

/** Rivals (B2B) or similar creators (B2C) worth following, found in what people already post about your field. */
export function suggestPeers(profile: Profile | null, posts: Post[], peers: Peer[], ar = false): Suggestion[] {
  const mine = [...(profile?.handles || []), profile?.orgName || ''].filter(Boolean).map((x) => x.toLowerCase())
  const known = new Set([...peers.map((p) => p.name.toLowerCase()), ...mine])
  const by = new Map<string, { n: number; reach: number; src: Set<string> }>()
  for (const p of posts) {
    if (p.lens === 'name') continue
    const k = p.author.trim(); if (!k || known.has(k.toLowerCase())) continue
    const e = by.get(k) || { n: 0, reach: 0, src: new Set<string>() }; e.n++; e.reach += p.reach; e.src.add(p.source); by.set(k, e)
  }
  return [...by.entries()].sort((a, b) => b[1].n * 1e6 + b[1].reach - (a[1].n * 1e6 + a[1].reach)).slice(0, 5)
    .map(([name, e]) => ({ name, why: ar ? `${e.n} منشور في مجالك، وصول ${Math.round(e.reach / 1000)}K، على ${[...e.src].join('، ')}` : `${e.n} posts in your field, reach ${Math.round(e.reach / 1000)}K, on ${[...e.src].join(', ')}` }))
}

/** Next steps for growth, each one tied to the numbers behind it. */
export function growthActions(profile: Profile | null, posts: Post[], peers: Peer[], ar = false, days = 7): Action[] {
  const L = (en: string, a: string) => (ar ? a : en)
  const now = Date.now(), win = (ps: Post[], d: number, off = 0) => ps.filter((p) => p.ts >= now - (d + off) * DAY && p.ts < now - off * DAY)
  const name = win(posts.filter((p) => p.lens === 'name'), days), prev = win(posts.filter((p) => p.lens === 'name'), days, days)
  const out: Action[] = []
  const neg = name.filter((p) => p.sentiment === 'negative'), pos = name.filter((p) => p.sentiment === 'positive')
  const open = name.filter((p) => !p.handled && (p.urgent || p.sentiment === 'negative')).sort((a, b) => b.reach - a.reach)
  if (open[0]) out.push({ kind: 'reply', title: L(`Reply to ${open[0].author} on ${open[0].source}`, `رد على ${open[0].author} على ${open[0].source}`), why: L(`Because it is your most reached open complaint (${Math.round(open[0].reach / 1000)}K reach) and ${open.length} negative or urgent mentions are still unanswered.`, `لأنها أكتر شكوى وصولًا لسه مفتوحة (${Math.round(open[0].reach / 1000)}K) وفي ${open.length} إشارة سلبية أو عاجلة لسه من غير رد.`) })
  if (name.length >= 5 && neg.length / name.length > 0.3) {
    const w = topWords(neg.map((p) => p.text), 1)[0]
    out.push({ kind: 'fix', title: w ? L(`Look into what people link to "${w.word}"`, `افهم ليه الناس بتربط "${w.word}" بيك`) : L('Find the root of the complaints', 'دوّر على أصل الشكاوى'), why: L(`Because ${Math.round((neg.length / name.length) * 100)}% of mentions this period are negative${w ? ` and "${w.word}" shows up ${w.count} times in them` : ''}.`, `لأن ${Math.round((neg.length / name.length) * 100)}% من الإشارات في الفترة دي سلبية${w ? ` وكلمة "${w.word}" ظهرت ${w.count} مرة فيها` : ''}.`) })
  }
  const field = win(posts.filter((p) => p.lens === 'field'), days), fprev = win(posts.filter((p) => p.lens === 'field'), days, days)
  const rising = (profile?.topics || []).map((tp) => ({ tp, n: field.filter((p) => matchesAny(p.text, [tp])).length, o: fprev.filter((p) => matchesAny(p.text, [tp])).length })).filter((x) => x.n >= 3 && x.n > x.o).sort((a, b) => b.n - b.o - (a.n - a.o))[0]
  if (rising) out.push({ kind: 'content', title: L(`Publish something about ${rising.tp}`, `انشر محتوى عن ${rising.tp}`), why: L(`Because it went from ${rising.o} to ${rising.n} posts in your field, so people are looking for it now.`, `لأنه زاد من ${rising.o} لـ${rising.n} منشور في مجالك، يعني الناس بتدوّر عليه دلوقتي.`) })
  const star = pos.sort((a, b) => b.reach - a.reach)[0]
  if (star) out.push({ kind: 'amplify', title: L(`Thank and share what ${star.author} said`, `اشكر ${star.author} وشارك كلامه`), why: L(`Because it is your best positive mention (${Math.round(star.reach / 1000)}K reach) and positive voices are ${pos.length} of ${name.length}.`, `لأنها أحسن إشارة إيجابية (${Math.round(star.reach / 1000)}K وصول) والإيجابي ${pos.length} من ${name.length}.`) })
  const mineN = name.length, rivals = peers.map((x) => ({ x, n: win(posts.filter((p) => p.peerId === x.id), days).length })).sort((a, b) => b.n - a.n)[0]
  if (rivals && rivals.n > mineN) out.push({ kind: 'watch', title: L(`Study what ${rivals.x.name} is doing`, `ادرس بيعمل إيه ${rivals.x.name}`), why: L(`Because it got ${rivals.n} mentions against your ${mineN} in the same period.`, `لأنه جاب ${rivals.n} إشارة مقابل ${mineN} ليك في نفس الفترة.`) })
  if (prev.length && name.length < prev.length * 0.7) out.push({ kind: 'content', title: L('Post more often this week', 'انشر أكتر الأسبوع ده'), why: L(`Because mentions of you fell from ${prev.length} to ${name.length}.`, `لأن الإشارات ليك نزلت من ${prev.length} لـ${name.length}.`) })
  return out.slice(0, 5)
}

/** The day in brief for someone with no time: what was said, what moved, what needs them. */
export function dayBrief(profile: Profile | null, posts: Post[], ar = false): string[] {
  const L = (en: string, a: string) => (ar ? a : en)
  const now = Date.now(), day = posts.filter((p) => p.ts >= now - DAY)
  const name = day.filter((p) => p.lens === 'name'), f = day.filter((p) => p.lens === 'field')
  const pos = name.filter((p) => p.sentiment === 'positive').length, neg = name.filter((p) => p.sentiment === 'negative').length
  const lines = [L(`${name.length} mentions of you in the last 24 hours: ${pos} positive, ${neg} negative.`, `${name.length} إشارة ليك في آخر 24 ساعة: ${pos} إيجابي و${neg} سلبي.`)]
  const top = [...name].sort((a, b) => b.reach - a.reach)[0]
  if (top) lines.push(L(`Biggest voice: ${top.author} on ${top.source}, reach ${Math.round(top.reach / 1000)}K, ${top.sentiment}.`, `أكبر صوت: ${top.author} على ${top.source}، وصول ${Math.round(top.reach / 1000)}K.`))
  const w = topWords(f.map((p) => p.text), 2); if (w.length) lines.push(L(`In your field people talk about ${w.map((x) => x.word).join(' and ')}.`, `في مجالك الناس بتتكلم عن ${w.map((x) => x.word).join(' و')}.`))
  const open = name.filter((p) => !p.handled && (p.urgent || p.sentiment === 'negative')).length
  lines.push(open ? L(`${open} need you.`, `${open} محتاجينك.`) : L('Nothing needs you right now.', 'مفيش حاجة محتاجاك دلوقتي.'))
  return lines
}
