import { XMLParser } from 'fast-xml-parser'

export type Lens = 'name' | 'field' | 'peer'
export type Source = 'X' | 'Facebook' | 'Instagram' | 'LinkedIn' | 'News' | 'Blogs' | 'Reddit' | 'Mastodon' | 'Web'
export interface Item { source: Source; author: string; text: string; url?: string; ts: number; reach: number; reactions: number; externalId: string }
export type Fetch = typeof fetch

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' })
const arr = <T,>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x])
const txt = (x: any): string => (x == null ? '' : typeof x === 'object' ? String(x['#text'] ?? '') : String(x))
const strip = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
async function getText(f: Fetch, url: string, init?: RequestInit): Promise<string> {
  const r = await f(url, { ...init, headers: { 'user-agent': 'Scoop360-listener/1.0', ...(init?.headers || {}) } })
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`)
  return r.text()
}

/** Parse an RSS 2.0 or Atom document. Exported for tests. */
export function parseFeed(xml: string, source: Source, maxAgeDays = 14): Item[] {
  const doc = parser.parse(xml)
  const out: Item[] = []
  const cutoff = Date.now() - maxAgeDays * 864e5
  const rssItems = arr(doc?.rss?.channel?.item), atomItems = arr(doc?.feed?.entry)
  for (const it of rssItems) {
    const title = strip(txt(it.title)), desc = strip(txt(it.description)), ts = Date.parse(txt(it.pubDate)) || Date.now()
    const src = txt(it.source) || txt(it['dc:creator']) || ''
    const text = desc && !desc.startsWith(title) && desc.length > 20 ? `${title}. ${desc}` : title
    const url = txt(it.link) || undefined
    if (title && ts >= cutoff) out.push({ source, author: src || (url ? new URL(url).hostname : 'Unknown'), text: text.slice(0, 600), url, ts, reach: 0, reactions: 0, externalId: txt(it.guid) || url || title })
  }
  for (const it of atomItems) {
    const title = strip(txt(it.title)), sum = strip(txt(it.summary) || txt(it.content)), ts = Date.parse(txt(it.updated) || txt(it.published)) || Date.now()
    const link = arr<any>(it.link).find((l) => !l['@_rel'] || l['@_rel'] === 'alternate')?.['@_href']
    const text = sum && sum.length > 20 ? `${title}. ${sum}` : title
    if (title && ts >= cutoff) out.push({ source, author: txt(it.author?.name) || (link ? new URL(link).hostname : 'Unknown'), text: text.slice(0, 600), url: link, ts, reach: 0, reactions: 0, externalId: txt(it.id) || link || title })
  }
  return out
}

export async function googleNews(f: Fetch, term: string, arabic: boolean): Promise<Item[]> {
  const q = encodeURIComponent(`"${term}" when:7d`)
  const url = arabic ? `https://news.google.com/rss/search?q=${q}&hl=ar&gl=EG&ceid=EG:ar` : `https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=US:en`
  return parseFeed(await getText(f, url), 'News', 8).slice(0, 15)
}
export async function rssFeed(f: Fetch, url: string): Promise<Item[]> { return parseFeed(await getText(f, url), 'Blogs', 14).slice(0, 40) }

export async function xSearch(f: Fetch, bearer: string, query: string): Promise<Item[]> {
  const u = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query + ' -is:retweet')}&max_results=25&tweet.fields=created_at,public_metrics,lang&expansions=author_id&user.fields=username,name`
  const r = await f(u, { headers: { authorization: `Bearer ${bearer}` } })
  if (!r.ok) throw new Error(`X API answered ${r.status}: ${(await r.text()).slice(0, 140)}`)
  const j: any = await r.json()
  const users = new Map<string, any>((j.includes?.users || []).map((x: any) => [x.id, x]))
  return (j.data || []).map((t: any): Item => {
    const m = t.public_metrics || {}, us = users.get(t.author_id)
    return { source: 'X', author: us ? us.name : 'X user', text: String(t.text).replace(/\s+/g, ' '), url: us ? `https://x.com/${us.username}/status/${t.id}` : undefined, ts: Date.parse(t.created_at) || Date.now(), reach: m.impression_count || 0, reactions: (m.like_count || 0) + (m.retweet_count || 0) + (m.reply_count || 0) + (m.quote_count || 0), externalId: 'x:' + t.id }
  })
}

const GRAPH = 'https://graph.facebook.com/v21.0'
export async function facebookPage(f: Fetch, pageId: string, token: string, ownName: string): Promise<Item[]> {
  const fields = 'message,created_time,permalink_url,from,reactions.summary(true).limit(0),comments.limit(25){message,from,created_time,like_count,permalink_url}'
  const r = await f(`${GRAPH}/${encodeURIComponent(pageId)}/feed?fields=${encodeURIComponent(fields)}&limit=20&access_token=${encodeURIComponent(token)}`)
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Facebook answered ${r.status}: ${j?.error?.message || ''}`.slice(0, 200))
  const out: Item[] = []
  for (const p of j.data || []) {
    if (p.from?.name && p.from.name !== ownName && p.message) out.push({ source: 'Facebook', author: p.from.name, text: String(p.message).replace(/\s+/g, ' '), url: p.permalink_url, ts: Date.parse(p.created_time), reach: 0, reactions: p.reactions?.summary?.total_count || 0, externalId: 'fb:' + p.id })
    for (const c of p.comments?.data || []) if (c.message && c.from?.name !== ownName) out.push({ source: 'Facebook', author: c.from?.name || 'Facebook user', text: String(c.message).replace(/\s+/g, ' '), url: c.permalink_url || p.permalink_url, ts: Date.parse(c.created_time), reach: 0, reactions: c.like_count || 0, externalId: 'fb:' + c.id })
  }
  return out
}
export async function instagramTags(f: Fetch, userId: string, token: string): Promise<Item[]> {
  const r = await f(`${GRAPH}/${encodeURIComponent(userId)}/tags?fields=caption,username,timestamp,permalink,like_count,comments_count&limit=25&access_token=${encodeURIComponent(token)}`)
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Instagram answered ${r.status}: ${j?.error?.message || ''}`.slice(0, 200))
  return (j.data || []).filter((m: any) => m.caption).map((m: any): Item => ({ source: 'Instagram', author: m.username || 'Instagram user', text: String(m.caption).replace(/\s+/g, ' '), url: m.permalink, ts: Date.parse(m.timestamp), reach: 0, reactions: (m.like_count || 0) + (m.comments_count || 0), externalId: 'ig:' + m.id }))
}

// ---------- free sources (no key, no account) ----------
export const clock = { sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) }

export async function bingNews(f: Fetch, term: string, arabic: boolean): Promise<Item[]> {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent('"' + term + '"')}&format=rss&setlang=${arabic ? 'ar' : 'en'}`
  return parseFeed(await getText(f, url), 'News', 8).slice(0, 15)
}

/** GDELT indexes news from all over the world. It allows one request every 5 seconds. */
export async function gdelt(f: Fetch, term: string): Promise<Item[]> {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent('"' + term + '"')}&mode=artlist&maxrecords=25&format=json&timespan=7d&sort=datedesc`
  const body = await getText(f, url)
  let j: any; try { j = JSON.parse(body) } catch { throw new Error('GDELT answered: ' + body.slice(0, 120)) }
  return (j.articles || []).map((a: any): Item => {
    const m = String(a.seendate || '').match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
    return { source: 'News', author: a.domain || 'GDELT', text: String(a.title || '').trim().slice(0, 400), url: a.url, ts: m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : Date.now(), reach: 0, reactions: 0, externalId: a.url || a.title }
  }).filter((i: Item) => i.text)
}

/** Reddit exposes search as an RSS feed. Reddit sometimes blocks cloud IPs; the status line shows when it does. */
export async function reddit(f: Fetch, term: string): Promise<Item[]> {
  const url = `https://www.reddit.com/search.rss?q=${encodeURIComponent('"' + term + '"')}&sort=new&t=week&limit=25`
  return parseFeed(await getText(f, url), 'Reddit', 8).slice(0, 25)
}

/** Public hashtag timeline of a Mastodon server. Works without an account. */
export async function mastodon(f: Fetch, term: string, server = 'mastodon.social'): Promise<Item[]> {
  const tag = term.replace(/^#/, '').replace(/[^\p{L}\p{N}_]+/gu, '')
  if (!tag) return []
  const j: any[] = JSON.parse(await getText(f, `https://${server}/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=30`))
  return j.filter((s) => !s.reblog).map((s: any): Item => ({ source: 'Mastodon', author: s.account?.display_name || s.account?.acct || 'Mastodon user', text: strip(String(s.content || '')).slice(0, 600), url: s.url, ts: Date.parse(s.created_at) || Date.now(), reach: 0, reactions: (s.favourites_count || 0) + (s.reblogs_count || 0) + (s.replies_count || 0), externalId: 'mt:' + s.id })).filter((i) => i.text)
}

/** Hacker News stories and comments through the Algolia API. Mostly tech topics. */
export async function hackerNews(f: Fetch, term: string): Promise<Item[]> {
  const since = Math.floor(Date.now() / 1000) - 14 * 86400
  const j: any = JSON.parse(await getText(f, `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent('"' + term + '"')}&tags=(story,comment)&hitsPerPage=20&numericFilters=created_at_i>${since}`))
  return (j.hits || []).map((h: any): Item => {
    const text = strip(String(h.comment_text || h.story_text || h.title || h.story_title || '')).slice(0, 600)
    return { source: 'Web', author: h.author || 'Hacker News', text, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, ts: (h.created_at_i || 0) * 1000 || Date.now(), reach: 0, reactions: (h.points || 0) + (h.num_comments || 0), externalId: 'hn:' + h.objectID }
  }).filter((i: Item) => i.text)
}
