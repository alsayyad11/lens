import assert from 'node:assert/strict'
import { parseFeed, xSearch, facebookPage, clock } from './sources'
import { llm, llmWithFallback } from './llm'
import { assignLens, gather, docId } from './collect'
import { parseJsonArray, classifyBatch } from './ai'
import { classifyLexicon } from './lexicon'

const now = new Date().toUTCString()
const rss = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Nile Roast expands delivery - Cairo Business</title><link>https://news.example.com/a</link><guid>g1</guid><pubDate>${now}</pubDate><description>&lt;a href="x"&gt;Local roasters such as Nile Roast expand delivery ahead of winter&lt;/a&gt;</description><source url="https://cb.example">Cairo Business</source></item>
<item><title>Old story</title><link>https://news.example.com/old</link><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate></item></channel></rss>`
const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Delta Beans free delivery</title><id>tag:1</id><updated>${new Date().toISOString()}</updated><link rel="alternate" href="https://blog.example.com/p1"/><author><name>Coffee Blog</name></author><summary>Delta Beans launched a free delivery offer across Egypt this week</summary></entry></feed>`

const items = parseFeed(rss, 'News'); assert.equal(items.length, 1); assert.equal(items[0].author, 'Cairo Business'); assert.ok(items[0].text.includes('expand delivery'))
const at = parseFeed(atom, 'Blogs'); assert.equal(at.length, 1); assert.equal(at[0].author, 'Coffee Blog'); assert.equal(at[0].url, 'https://blog.example.com/p1')

const plan = { name: ['Nile Roast'], field: ['#specialtycoffee'], peers: [{ id: 'p1', name: 'Delta Beans' }] }
assert.deepEqual(assignLens('Delta Beans launched an offer', plan), { lens: 'peer', peerId: 'p1' })
assert.deepEqual(assignLens('I love Nile Roast', plan), { lens: 'name' })
assert.deepEqual(assignLens('everyone talks about specialtycoffee', plan), { lens: 'field' })
assert.equal(assignLens('unrelated', plan), null)
assert.equal(docId(items[0]), docId({ ...items[0] }))

assert.deepEqual(parseJsonArray('```json\n[{"i":0}]\n```'), [{ i: 0 }])
assert.equal(classifyLexicon('محدش رد على التليفون ونصب').urgent, true)

clock.sleep = async () => {}
const fakeFetch: any = async (url: string) => {
  const u = String(url)
  if (u.includes('bing.com/news')) return new Response(rss.replace('Nile Roast expands delivery - Cairo Business', 'Nile Roast on Bing'), { status: 200 })
  if (u.includes('reddit.com')) return new Response('blocked', { status: 429 })
  if (u.includes('mastodon.social/api/v1/timelines/tag/NileRoast')) return new Response(JSON.stringify([{ id: '7', content: '<p>Loving my <b>Nile Roast</b> beans</p>', url: 'https://mastodon.social/@a/7', created_at: new Date().toISOString(), favourites_count: 2, reblogs_count: 1, replies_count: 0, account: { display_name: 'Aya', acct: 'aya' } }]), { status: 200 })
  if (u.includes('mastodon.social')) return new Response('[]', { status: 200 })
  if (u.includes('gdeltproject')) return new Response(JSON.stringify({ articles: [{ url: 'https://g.example/1', title: 'Nile Roast opens a new branch', domain: 'g.example', seendate: '20261125T101500Z' }] }), { status: 200 })
  if (u.includes('hn.algolia.com')) return new Response(JSON.stringify({ hits: [{ objectID: '5', title: 'Show HN: Nile Roast tracker', author: 'dev', points: 10, num_comments: 2, created_at_i: Math.floor(Date.now() / 1000) }] }), { status: 200 })
  if (u.includes('generativelanguage.googleapis.com')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"i":0,"sentiment":"negative","urgent":true,"topics":["delivery"],"summary":"late"},{"i":1,"sentiment":"positive","urgent":false,"topics":[],"summary":"nice"}]' }] } }] }), { status: 200 })
  if (u.includes('api.groq.com')) return new Response(JSON.stringify({ choices: [{ message: { content: 'groq says hi' } }] }), { status: 200 })
  if (u.includes('openrouter.ai')) return new Response('rate limited', { status: 429 })
  if (u.includes('pollinations.ai')) return new Response(JSON.stringify({ choices: [{ message: { content: 'free says hi' } }] }), { status: 200 })
  if (u.includes('news.google.com')) return new Response(rss, { status: 200 })
  if (u.includes('twitter.com')) return new Response(JSON.stringify({ data: [{ id: '9', text: 'Nile Roast was great', author_id: 'a', created_at: new Date().toISOString(), public_metrics: { like_count: 3, retweet_count: 1, reply_count: 0, quote_count: 0, impression_count: 1200 } }], includes: { users: [{ id: 'a', username: 'mona', name: 'Mona' }] } }), { status: 200 })
  if (u.includes('graph.facebook.com')) return new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token' } }), { status: 400 })
  if (u.includes('blog.example.com/feed')) return new Response(atom, { status: 200 })
  return new Response('nope', { status: 404 })
}
;(async () => {
  const x = await xSearch(fakeFetch, 'tok', '"Nile Roast"'); assert.equal(x[0].reach, 1200); assert.equal(x[0].reactions, 4); assert.equal(x[0].url, 'https://x.com/mona/status/9')
  await assert.rejects(facebookPage(fakeFetch, '1', 'bad', 'Me'), /Invalid OAuth/)
  const status: any = {}
  const got = await gather(fakeFetch, { news: { enabled: true }, blogs: { enabled: true, feeds: ['https://blog.example.com/feed'] }, x: { enabled: true, bearer: 't' }, facebook: { enabled: true, pageId: '1', token: 'bad' } }, plan, 'Nile Roast', status)
  assert.equal(status.news.state, 'ok'); assert.equal(status.blogs.state, 'ok'); assert.equal(status.x.state, 'ok'); assert.equal(status.facebook.state, 'failed')
  assert.ok(got.some((g) => g.lens === 'peer' && g.peerId === 'p1' && g.source === 'Blogs'), 'blog item routed to peer lens')
  assert.ok(got.some((g) => g.source === 'X' && g.lens === 'name'))
  // free sources: each reports on its own, a failing one does not stop the rest
  const st2: any = {}
  const got2 = await gather(fakeFetch, { gdelt: { enabled: true }, hackernews: { enabled: true } }, plan, 'Nile Roast', st2)
  assert.equal(st2.bing.state, 'ok'); assert.equal(st2.reddit.state, 'failed'); assert.match(st2.reddit.message, /429/)
  assert.equal(st2.mastodon.state, 'ok'); assert.equal(st2.gdelt.state, 'ok'); assert.equal(st2.hackernews.state, 'ok')
  assert.ok(got2.some((g) => g.source === 'Mastodon' && g.lens === 'name' && g.text.includes('Nile Roast beans') && g.reactions === 3))
  assert.ok(got2.some((g) => g.source === 'News' && g.author === 'g.example' && g.ts === Date.UTC(2026, 10, 25, 10, 15, 0)))
  assert.ok(got2.some((g) => g.source === 'Web' && g.lens === 'name'))

  // AI providers (request shape and answer parsing)
  const seen: string[] = []
  const spy: any = async (u: any, init: any) => { seen.push(String(u) + '|' + (init?.headers?.['x-goog-api-key'] || init?.headers?.authorization || '')); return fakeFetch(u, init) }
  assert.equal(await llm({ provider: 'groq', key: 'gk' }, 's', 'u', 10, spy), 'groq says hi')
  assert.ok(seen.some((x) => x.includes('api.groq.com') && x.endsWith('Bearer gk')))
  await assert.rejects(llm({ provider: 'openrouter', key: 'k' }, 's', 'u', 10, spy), /429/)
  await assert.rejects(llm({ provider: 'gemini' }, 's', 'u', 10, spy), /No API key/)
  await assert.rejects(llmWithFallback(undefined, 's', 'u', 10, spy), /AI is off/)
  const fb = await llmWithFallback({ provider: 'openrouter', key: 'k' }, 's', 'u', 10, spy)
  assert.equal(fb.text, 'free says hi'); assert.equal(fb.provider, 'keyless')
  const ai = await classifyBatch({ provider: 'gemini', key: 'gem' }, 'Nile Roast', ['Order late', 'Best coffee'], spy)
  assert.equal(ai.usedAI, true); assert.equal(ai.out[0].urgent, true); assert.deepEqual(ai.out[0].topics, ['delivery']); assert.equal(ai.out[1].summary, 'nice')
  assert.ok(seen.some((x) => x.includes('generativelanguage') && x.endsWith('|gem')))

  const c = await classifyBatch(undefined, 'Nile Roast', ['Order late, nobody answered', 'Best coffee, thanks'])
  assert.equal(c.usedAI, false); assert.equal(c.out[0].sentiment, 'negative'); assert.equal(c.out[1].sentiment, 'positive')
  console.log('ALL FUNCTION TESTS PASSED')
})().catch((e) => { console.error(e); process.exit(1) })
