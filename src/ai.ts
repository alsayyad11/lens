// Browser-side AI helpers: used in demo mode, and when the Cloud Function is not deployed yet.
import { llmWithFallback, type AiCfg } from './llm'
import type { AiSettings, Peer, Post, Profile } from './types'

export const toCfg = (a: AiSettings): AiCfg | undefined => (a.provider === 'none' ? undefined : { provider: a.provider, key: a.key || undefined, model: a.model || undefined })
const DAY = 864e5

export async function askLocalAI(a: AiSettings, profile: Profile | null, posts: Post[], peers: Peer[], question: string, lang: string): Promise<string> {
  const peerName = new Map(peers.map((p) => [p.id, p.name]))
  const recent = posts.filter((p) => p.ts >= Date.now() - 14 * DAY), wk = recent.filter((p) => p.ts >= Date.now() - 7 * DAY)
  const name = wk.filter((p) => p.lens === 'name'), pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)
  const line = (p: Post) => `- [${p.lens}${p.peerId ? ':' + peerName.get(p.peerId) : ''}|${p.source}|${p.sentiment}${p.urgent ? '|URGENT' : ''}|reach ${p.reach}|${new Date(p.ts).toISOString().slice(0, 10)}] ${p.author}: ${p.text.slice(0, 220)}`
  const ctx = [
    `Workspace: ${profile?.orgName} (${profile?.accountType}). Names tracked: ${(profile?.handles || []).join(', ')}. Topics: ${(profile?.topics || []).join(', ')}. Peers: ${peers.map((p) => p.name).join(', ')}.`,
    `Last 7 days, own mentions: ${name.length}, positive ${pct(name.filter((p) => p.sentiment === 'positive').length, name.length)}%, negative ${pct(name.filter((p) => p.sentiment === 'negative').length, name.length)}%.`,
    `Posts per lens (7d): name ${name.length}, field ${wk.filter((p) => p.lens === 'field').length}, ${peers.map((x) => `${x.name} ${wk.filter((p) => p.peerId === x.id).length}`).join(', ')}.`,
    'Most relevant posts:', ...[...recent].sort((x, y) => (y.urgent ? 1e9 : 0) + y.reach - ((x.urgent ? 1e9 : 0) + x.reach)).slice(0, 25).map(line),
  ].join('\n')
  const sys = `You are Ask LENS, the analyst inside a social listening product. Answer ONLY from the data provided. If the data cannot answer, say what is missing. Be concise and concrete: numbers, names, and a recommended next step when useful. Answer in ${lang === 'ar' ? 'Arabic' : 'the language of the question'}.`
  return (await llmWithFallback(toCfg(a), sys, `Data:\n${ctx}\n\nQuestion: ${question}`, 700)).text.trim()
}

export async function draftLocalAI(a: AiSettings, p: Post, brand: string, lang: string): Promise<string> {
  const sys = `You write short public replies for the brand "${brand}" on ${p.source}. Match the language and dialect of the post (Egyptian Arabic stays Egyptian). Be warm, human, specific, never defensive. If the post is negative, apologize once, own the issue, and move to a private channel. If positive, thank them briefly. Max 45 words. No hashtags, no emojis unless the post uses them. Output only the reply.`
  return (await llmWithFallback(toCfg(a), sys, `Author: ${p.author}\nSentiment: ${p.sentiment}\nPost: ${p.text}\nReply language hint: ${lang}`, 300)).text.trim()
}

const parseJson = <T,>(txt: string): T | null => { const m = txt.match(/\[[\s\S]*\]/); if (!m) return null; try { return JSON.parse(m[0]) as T } catch { return null } }

export async function suggestPeersAI(a: AiSettings, profile: Profile | null, peers: Peer[], lang: string): Promise<{ name: string; why: string }[]> {
  const indiv = profile?.accountType === 'individual'
  const sys = `You help a ${indiv ? 'content creator or public figure' : 'company'} choose ${indiv ? 'similar creators' : 'competitors'} to monitor. Reply with ONLY a JSON array of 5 objects {"name": string, "why": string}. Use real, well known names in the same market and region. "why" is one short sentence in ${lang === 'ar' ? 'Egyptian Arabic' : 'English'}. Never repeat the names already followed.`
  const user = `Name: ${profile?.orgName}. Field: ${profile?.industry || ''} ${(profile?.topics || []).join(', ')}. Already followed: ${peers.map((p) => p.name).join(', ') || 'none'}.`
  const r = parseJson<{ name: string; why: string }[]>((await llmWithFallback(toCfg(a), sys, user, 500)).text)
  return (r || []).filter((x) => x?.name).slice(0, 5)
}
