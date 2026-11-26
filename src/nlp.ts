import type { Post, Sentiment, Source, Profile } from './types'

// Lightweight Arabic + English sentiment lexicon. It is a rule-based first pass for the MVP,
// not a trained model. The AI track replaces classify() with the real classifier later.
const POS = ['great','best','love','loved','excellent','amazing','good','happy','thanks','thank','recommend','perfect','fast','awesome','delicious','smooth',
  'ممتاز','رائع','حلو','جميل','احسن','أحسن','افضل','أفضل','شكرا','شكراً','بحبه','احببت','أحببت','مذهل','سريع','تحفة','انصح','أنصح','يجنن','عظيم']
const NEG = ['bad','worst','late','slow','terrible','awful','hate','angry','refund','scam','broken','nobody answered','disappointed','poor','rude','complaint','cold','never again',
  'سيء','سيئ','وحش','أسوأ','اسوأ','تأخر','متأخر','بطيء','نصب','مشكلة','شكوى','زفت','ما ردوا','محدش رد','غالي','مقرف','خايب','فاشل','مستحيل','تعبان','ردي']
const URGENT = ['scam','refund','legal','lawsuit','sue','nobody answered','fraud','نصب','محامي','قضية','محدش رد','ما ردوا','احتيال']
const NEGATORS = ['not ','no ','never ','مش ','ما ','لا ','مو ']

const norm = (s: string) => s.toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
const NP = POS.map(norm), NN = NEG.map(norm), NU = URGENT.map(norm)

export function classify(text: string): { sentiment: Sentiment; urgent: boolean } {
  const t = norm(text)
  let score = 0
  const hit = (w: string, sign: number) => {
    let i = t.indexOf(w)
    while (i >= 0) {
      const before = t.slice(Math.max(0, i - 6), i)
      const negated = NEGATORS.some((n) => before.endsWith(norm(n)))
      score += negated ? -sign * 0.8 : sign
      i = t.indexOf(w, i + w.length)
    }
  }
  NP.forEach((w) => hit(w, 1)); NN.forEach((w) => hit(w, -1))
  const sentiment: Sentiment = score > 0.5 ? 'positive' : score < -0.5 ? 'negative' : 'neutral'
  return { sentiment, urgent: sentiment === 'negative' && NU.some((w) => t.includes(w)) }
}

export const matchesAny = (text: string, terms: string[]) => { const t = norm(text); return terms.some((k) => k && t.includes(norm(k.replace(/^#/, '')))) }

const STOP = new Set('the a an and or of to in on for with is are was were be it this that at by from as i you we they my our your have has had not but so very just about when what how why who will can would not من في على الى الي عن مع هذا هذه ده دي انا انت هو هي احنا كان كانت لا ما مش لقد او ثم كل بعد قبل'.split(' '))
export function topWords(texts: string[], n = 8): { word: string; count: number }[] {
  const m = new Map<string, number>()
  texts.forEach((t) => (t.match(/#?[\p{L}\p{N}_]{3,}/gu) || []).forEach((w) => { const k = norm(w); if (!STOP.has(k)) m.set(k, (m.get(k) || 0) + 1) }))
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([word, count]) => ({ word, count }))
}

export const fmt = (n: number) => (!n ? '—' : n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '') + 'K' : String(n))
export const ago = (ts: number, lang: 'en' | 'ar' = 'en') => {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000))
  const [v, u] = m < 60 ? [m, 'm'] : m < 1440 ? [Math.round(m / 60), 'h'] : [Math.round(m / 1440), 'd']
  return lang === 'ar' ? `منذ ${v}${u === 'm' ? 'د' : u === 'h' ? 'س' : 'ي'}` : `${v}${u} ago`
}

// ---- Demo data so a new workspace is never empty ----
const rnd = (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1))
const pick = <T,>(a: T[]) => a[rnd(0, a.length - 1)]
export function demoPosts(p: Profile, peerNames: { id: string; name: string }[]): Omit<Post, 'id'>[] {
  const b = p.orgName || 'Nile Roast'
  const src = ['X', 'Facebook', 'Instagram', 'News', 'Blogs', 'LinkedIn'] as Source[]
  const authors = ['Mona Kamal', 'Youssef Ali', 'Laila Hassan', 'Cairo Business', 'Omar Fathy', 'Sara Nabil', 'Karim Adel', 'Hana Samir']
  const nameTexts = [
    `Order from ${b} arrived two days late and nobody answered the phone.`, `${b} is the best I have had this year, amazing quality.`,
    `Local brands such as ${b} expand delivery ahead of the winter season.`, `طلبي من ${b} اتأخر يومين ومحدش رد على التليفون`,
    `${b} خدمة ممتازة وسريعة، انصح بيها`, `Not happy with ${b}, the support was rude and slow.`, `Thanks ${b} for the quick refund, great service.`,
    `${b} launched a new offer today.`, `تجربتي مع ${b} كانت رائعة جدا`, `Is ${b} a scam? I paid and nothing arrived, I will take legal action.`,
  ]
  const fieldTexts = (p.topics.length ? p.topics : ['#trends', '#market']).flatMap((t) => [
    `Everyone is talking about ${t} this week, interest is rising fast.`, `Why ${t} is getting expensive: a short thread.`, `${t} صار الترند الأول عندنا النهاردة`, `Best tips for ${t} at home, loved this guide.`])
  const peerTexts = (n: string) => [`${n} launched a free delivery offer, great move.`, `${n} new store opens next week.`, `${n} أطلقت عرض جديد على كل المنتجات`, `Customers complain about late deliveries at ${n}.`]
  const out: Omit<Post, 'id'>[] = []
  const now = Date.now()
  for (let i = 0; i < 46; i++) {
    const text = pick(nameTexts); const c = classify(text)
    out.push({ lens: 'name', author: pick(authors), source: pick(src), text, ...c, reach: rnd(900, 90000), reactions: rnd(10, 1800), ts: now - rnd(20, 7 * 1440) * 60000 })
  }
  for (let i = 0; i < 30; i++) {
    const text = pick(fieldTexts); const c = classify(text)
    out.push({ lens: 'field', author: pick(authors), source: pick(src), text, ...c, reach: rnd(500, 60000), reactions: rnd(5, 900), ts: now - rnd(20, 7 * 1440) * 60000 })
  }
  const peers = peerNames
  peers.forEach((pe) => { for (let i = 0; i < rnd(8, 16); i++) { const text = pick(peerTexts(pe.name)); const c = classify(text)
    out.push({ lens: 'peer', peerId: pe.id, author: pe.name, source: pick(['X', 'Facebook', 'Instagram'] as Source[]), text, ...c, reach: rnd(900, 70000), reactions: rnd(10, 1500), ts: now - rnd(20, 7 * 1440) * 60000 }) } })
  return out
}
